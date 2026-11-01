from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.engines.escalation import create_escalation
from app.engines.monitor import run_checks
from app.engines.notify import channels_for
from app.engines.rules import FALLBACK_CONFIG
from app.models import Application, Escalation, Notification, User
from tests.conftest import auth_headers, client


def _count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_tick_is_idempotent() -> None:
    with SessionLocal() as session:
        run_checks(session)
        session.flush()
        first = _count(session, Notification)
        run_checks(session)
        session.flush()
        second = _count(session, Notification)
        assert second == first
        session.rollback()


def test_escalation_is_created_once() -> None:
    with SessionLocal() as session:
        application = session.scalar(select(Application).where(Application.app_no == "AICTE/2026/001"))
        assert application is not None
        first = create_escalation(
            session,
            config=FALLBACK_CONFIG,
            entity_type="application",
            entity_id=application.id,
            level=1,
            institution=None,
            context="test",
            entity_label=application.app_no,
        )
        second = create_escalation(
            session,
            config=FALLBACK_CONFIG,
            entity_type="application",
            entity_id=application.id,
            level=1,
            institution=None,
            context="test",
            entity_label=application.app_no,
        )
        assert first is not None and second is not None
        assert first.id == second.id
        same_level = session.scalar(
            select(func.count())
            .select_from(Escalation)
            .where(Escalation.entity_id == application.id, Escalation.level == 1)
        )
        assert same_level == 1
        session.rollback()


def test_preferences_decide_channels() -> None:
    user = User(prefs={"in_app": True, "email": False, "sms": False, "daily_digest": False})
    assert channels_for(user) == ["in_app"]

    user.prefs = {"in_app": True, "email": True, "sms": True}
    assert channels_for(user) == ["in_app", "email", "sms"]


def test_preferences_round_trip(institution_session: dict) -> None:
    headers = auth_headers(institution_session["access_token"])
    original = client.get("/api/v1/me/preferences", headers=headers).json()

    updated = client.patch(
        "/api/v1/me/preferences",
        json={"in_app": True, "email": False, "sms": False, "daily_digest": True},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["email"] is False
    assert updated.json()["daily_digest"] is True

    restored = client.patch("/api/v1/me/preferences", json=original, headers=headers)
    assert restored.status_code == 200
    assert restored.json() == original


def test_notifications_and_read_flow(institution_session: dict) -> None:
    headers = auth_headers(institution_session["access_token"])
    page = client.get("/api/v1/notifications?page_size=10", headers=headers)
    assert page.status_code == 200
    body = page.json()
    assert body["unread"] >= 0 and isinstance(body["items"], list)

    marked = client.post("/api/v1/notifications/read-all", headers=headers)
    assert marked.status_code == 204
    after = client.get("/api/v1/notifications", headers=headers).json()
    assert after["unread"] == 0


def test_demo_clock_advance_and_reset(admin_session: dict) -> None:
    headers = auth_headers(admin_session["access_token"])
    before = client.get("/api/v1/demo/clock", headers=headers).json()
    assert before["demo_mode"] is True

    advanced = client.post("/api/v1/demo/clock/advance", json={"days": 1}, headers=headers)
    assert advanced.status_code == 200
    assert advanced.json()["offset_seconds"] == before["offset_seconds"] + 86400

    reset = client.post("/api/v1/demo/clock/reset", headers=headers)
    assert reset.status_code == 200
    assert reset.json()["offset_seconds"] == 0


def test_audit_chain_verifies(bureau_session: dict) -> None:
    headers = auth_headers(bureau_session["access_token"])
    response = client.get("/api/v1/audit/verify", headers=headers)
    assert response.status_code == 200
    assert response.json()["valid"] is True
    assert response.json()["checked"] > 0

    page = client.get("/api/v1/audit?page_size=5", headers=headers)
    assert page.status_code == 200
    assert len(page.json()["items"]) > 0


def test_institution_cannot_read_audit(institution_session: dict) -> None:
    headers = auth_headers(institution_session["access_token"])
    assert client.get("/api/v1/audit", headers=headers).status_code == 403
    assert client.get("/api/v1/escalations", headers=headers).status_code == 403
