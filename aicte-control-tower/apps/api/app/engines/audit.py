"""Append-only, hash-chained audit log."""

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.models import AuditEvent, User

GENESIS_HASH = "0" * 64


def _canonical(body: dict[str, Any]) -> str:
    return json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)


def append_audit(
    session: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    payload: dict[str, Any] | None = None,
    at=None,
) -> AuditEvent:
    last = session.scalar(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(1))
    previous = last.hash if last else GENESIS_HASH
    timestamp = at or now_utc()
    body = {
        "at": timestamp.isoformat(),
        "actor_id": str(actor.id) if actor else None,
        "role": actor.role if actor else None,
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "payload": payload or {},
    }
    digest = hashlib.sha256((previous + _canonical(body)).encode()).hexdigest()
    event = AuditEvent(
        at=timestamp,
        actor_id=actor.id if actor else None,
        role=actor.role if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
        prev_hash=previous,
        hash=digest,
    )
    session.add(event)
    session.flush()
    return event


def verify_chain(session: Session) -> dict[str, Any]:
    previous = GENESIS_HASH
    events = session.scalars(select(AuditEvent).order_by(AuditEvent.id)).all()
    for event in events:
        body = {
            "at": event.at.isoformat(),
            "actor_id": str(event.actor_id) if event.actor_id else None,
            "role": event.role,
            "action": event.action,
            "entity_type": event.entity_type,
            "entity_id": str(event.entity_id) if event.entity_id else None,
            "payload": event.payload,
        }
        expected = hashlib.sha256((previous + _canonical(body)).encode()).hexdigest()
        if event.prev_hash != previous or event.hash != expected:
            return {"valid": False, "broken_id": event.id, "checked": len(events)}
        previous = event.hash
    return {"valid": True, "broken_id": None, "checked": len(events)}
