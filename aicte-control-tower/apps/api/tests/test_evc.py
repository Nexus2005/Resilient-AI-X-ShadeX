"""EVC queue, conflict check, scheduling and visit closure."""

import uuid
from datetime import timedelta

from tests.conftest import auth_headers, client, demo_now


def _case_in_evc_queue(institution_session: dict, regional_session: dict) -> dict:
    institution_headers = auth_headers(institution_session["access_token"])
    regional_headers = auth_headers(regional_session["access_token"])

    created = client.post(
        "/api/v1/applications",
        json={"type": "new_institution", "academic_year": "2026-27"},
        headers=institution_headers,
    )
    assert created.status_code == 201, created.text
    application = created.json()
    submitted = client.post(
        f"/api/v1/applications/{application['id']}/submit", headers=institution_headers
    )
    assert submitted.status_code == 200, submitted.text

    signed = client.post(
        "/api/v1/sign", json={"password": "DemoPass!26"}, headers=regional_headers
    )
    cleared = client.post(
        f"/api/v1/applications/{application['id']}/clear",
        headers={**regional_headers, "X-Sign-Token": signed.json()["sign_token"]},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["stage"] == "evc_queue"
    return application


def _queue_case(evc_headers: dict[str, str], app_no: str) -> dict:
    queue = client.get("/api/v1/evc/queue", headers=evc_headers)
    assert queue.status_code == 200, queue.text
    return next(item for item in queue.json() if item["app_no"] == app_no)


def test_queue_is_scoped_and_hidden_from_institutions(
    evc_session: dict, institution_session: dict
) -> None:
    evc_headers = auth_headers(evc_session["access_token"])
    queue = client.get("/api/v1/evc/queue", headers=evc_headers)
    assert queue.status_code == 200, queue.text
    assert queue.json(), "the seeded queue should not be empty"
    assert {item["region_name"] for item in queue.json()} == {"Western"}

    forbidden = client.get(
        "/api/v1/evc/queue", headers=auth_headers(institution_session["access_token"])
    )
    assert forbidden.status_code == 403


def test_same_district_expert_is_rejected_with_a_reason(
    institution_session: dict, regional_session: dict, evc_session: dict
) -> None:
    evc_headers = auth_headers(evc_session["access_token"])
    application = _case_in_evc_queue(institution_session, regional_session)
    case = _queue_case(evc_headers, application["app_no"])
    assert case["status"] == "queued"

    experts = client.get("/api/v1/evc/experts", headers=evc_headers).json()
    conflict = next(item for item in experts if item["home_district"] == "Pune")
    assert conflict["id"] in case["conflict_ids"]

    response = client.post(
        f"/api/v1/evc/{case['id']}/schedule",
        json={
            "scheduled_for": (demo_now(evc_headers) + timedelta(days=5)).isoformat(),
            "expert_ids": [conflict["id"]],
        },
        headers=evc_headers,
    )
    assert response.status_code == 400, response.text
    assert "same district" in response.json()["detail"]


def test_visit_is_scheduled_then_closed_with_a_signature(
    institution_session: dict, regional_session: dict, evc_session: dict
) -> None:
    evc_headers = auth_headers(evc_session["access_token"])
    application = _case_in_evc_queue(institution_session, regional_session)
    case = _queue_case(evc_headers, application["app_no"])

    experts = client.get("/api/v1/evc/experts", headers=evc_headers).json()
    clean = next(item for item in experts if item["id"] not in case["conflict_ids"])
    visit_at = demo_now(evc_headers) + timedelta(days=6)

    scheduled = client.post(
        f"/api/v1/evc/{case['id']}/schedule",
        json={"scheduled_for": visit_at.isoformat(), "expert_ids": [clean["id"]]},
        headers=evc_headers,
    )
    assert scheduled.status_code == 200, scheduled.text
    body = scheduled.json()
    assert body["status"] == "scheduled"
    assert body["panel"][0]["name"] == clean["name"]

    detail = client.get(
        f"/api/v1/applications/{application['id']}", headers=auth_headers(
            regional_session["access_token"]
        )
    ).json()
    assert detail["current_stage"] == "evc_scheduled"
    assert detail["evc"]["status"] == "scheduled"

    unsigned = client.post(
        f"/api/v1/evc/{case['id']}/complete",
        json={"outcome": "recommended_for_approval", "recommendation": "Panel found the site ready."},
        headers=evc_headers,
    )
    assert unsigned.status_code == 403
    assert "Sign this record" in unsigned.json()["detail"]

    signed = client.post(
        "/api/v1/sign", json={"password": "DemoPass!26"}, headers=evc_headers
    )
    completed = client.post(
        f"/api/v1/evc/{case['id']}/complete",
        json={
            "outcome": "recommended_for_approval",
            "recommendation": "Panel found the site, faculty list and labs ready for approval.",
        },
        headers={**evc_headers, "X-Sign-Token": signed.json()["sign_token"]},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"

    detail = client.get(
        f"/api/v1/applications/{application['id']}", headers=evc_headers
    ).json()
    assert detail["current_stage"] == "sac_shc"
    assert detail["audit_chain_valid"] is True
    assert "evc.completed" in [item["action"] for item in detail["audit"]]


def test_unknown_evc_case_returns_404(evc_session: dict) -> None:
    headers = auth_headers(evc_session["access_token"])
    response = client.post(
        f"/api/v1/evc/{uuid.uuid4()}/schedule",
        json={
            "scheduled_for": (demo_now(headers) + timedelta(days=3)).isoformat(),
            "expert_ids": [str(uuid.uuid4())],
        },
        headers=headers,
    )
    assert response.status_code == 404
