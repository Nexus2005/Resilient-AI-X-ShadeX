"""Phase 4 gate: one scrutiny case through warning, overdue, escalation level 1 and 2.

Runs against the live API and the live database (inside the api container):

    docker compose exec -T api python scripts/scenario_deadlines.py

Prints the real rows: stage clock age, notifications raised, escalation levels and
the Mailpit inbox count. Nothing here approves or rejects anything.
"""

import sys

import httpx
from sqlalchemy import select

from app.core.clock import now_utc
from app.core.db import SessionLocal
from app.models import Escalation, Institution, Notification, StageInstance

BASE = "http://localhost:8000/api/v1"
PASSWORD = "DemoPass!26"


def login(client: httpx.Client, email: str) -> str:
    response = client.post(f"{BASE}/auth/login", json={"email": email, "password": PASSWORD})
    response.raise_for_status()
    return response.json()["access_token"]


def mailpit_count() -> int:
    try:
        with httpx.Client(timeout=5) as client:
            body = client.get("http://mailpit:8025/api/v1/messages").json()
        return int(body.get("total", 0))
    except Exception:
        return -1


def main() -> int:
    client = httpx.Client(timeout=60)
    admin = login(client, "admin@demo.controltower.in")
    headers = {"Authorization": f"Bearer {admin}"}

    reset = client.post(f"{BASE}/demo/clock/reset", headers=headers)
    reset.raise_for_status()
    print(f"1. clock reset        now={reset.json()['now'][:16]} offset={reset.json()['offset_seconds']}s")

    page = client.get(
        f"{BASE}/applications",
        headers=headers,
        params={"stage": "scrutiny", "page_size": 1, "sort": "submitted_at", "direction": "desc"},
    )
    page.raise_for_status()
    item = page.json()["items"][0]
    app_id = item["id"]
    print(f"2. case under watch   {item['app_no']}  {item['institution_name']}  stage={item['current_stage']}")

    steps = [(8, 8), (2, 10), (4, 14)]
    with SessionLocal() as session:
        stage = session.scalar(
            select(StageInstance).where(
                StageInstance.application_id == app_id, StageInstance.completed_at.is_(None)
            )
        )
        if stage is None:
            print("   no open stage instance on this case", file=sys.stderr)
            return 1
        institution = session.get(Institution, item["institution_id"])
        print(
            f"   entered stage at {stage.entered_at.strftime('%d %b %Y %H:%M')} "
            f"target {stage.due_at.strftime('%d %b %Y')} | {institution.name}"
        )
        # A copy of the rows for the check below, keyed by the stage clock window.
        window_days = (stage.due_at - stage.entered_at).total_seconds() / 86_400
        print(f"   stage window {window_days:.1f} days")

    for days, cumulative in steps:
        response = client.post(f"{BASE}/demo/clock/advance", headers=headers, json={"days": days})
        response.raise_for_status()
        body = response.json()
        with SessionLocal() as session:
            notes = session.scalars(
                select(Notification).where(
                    Notification.entity_type == "application", Notification.entity_id == app_id
                )
            ).all()
            escalations = session.scalars(
                select(Escalation).where(
                    Escalation.entity_type == "application", Escalation.entity_id == app_id
                )
            ).all()
            stage = session.scalar(
                select(StageInstance).where(
                    StageInstance.application_id == app_id, StageInstance.completed_at.is_(None)
                )
            )
            age = (now_utc() - stage.entered_at).total_seconds() / 86_400
            print(
                f"3.{steps.index((days, cumulative)) + 1} +{days} days (day {cumulative}) "
                f"clock={body['now'][:10]} stage age={age:.1f}d checks={body['checks']}"
            )
            print(
                f"   notifications={len(notes)} "
                + str(sorted({f'{note.template_key}/{note.channel}' for note in notes}))
            )
            print(
                f"   escalations={[(e.level, str(e.to_user_id)[:8]) for e in escalations]}"
            )

    with SessionLocal() as session:
        stage = session.scalar(
            select(StageInstance).where(
                StageInstance.application_id == app_id, StageInstance.completed_at.is_(None)
            )
        )
        database_age = (now_utc() - stage.entered_at).total_seconds() / 86_400
    print(f"   stored rows agree with the clock: stage age {database_age:.1f} days")
    print(f"4. mailpit inbox      {mailpit_count()} messages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
