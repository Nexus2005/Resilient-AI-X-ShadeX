"""Escalation ladder driven by the published rule configuration."""

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.engines.notify import notify
from app.engines.rules import escalation_ladder
from app.models import Escalation, Institution, Region, User


def _recipient_for(session: Session, target: str, institution: Institution | None) -> User | None:
    if target == "regional_officer" and institution is not None:
        return session.scalar(
            select(User).where(
                User.role == "regional_officer",
                User.region_id == institution.region_id,
                User.active.is_(True),
            )
        )
    if target in ("bureau_officer", "member_secretary_view"):
        return session.scalar(
            select(User).where(User.role == "bureau_officer", User.active.is_(True))
        )
    if target == "institution" and institution is not None:
        return session.scalar(
            select(User).where(
                User.role == "institution", User.institution_id == institution.id, User.active.is_(True)
            )
        )
    return None


def create_escalation(
    session: Session,
    *,
    config: dict,
    entity_type: str,
    entity_id: uuid.UUID,
    level: int,
    institution: Institution | None,
    context: str,
    entity_label: str,
) -> Escalation | None:
    ladder = escalation_ladder(config)
    entry = next((item for item in ladder if int(item.get("level", 0)) == level), None)
    if entry is None:
        return None

    existing = session.scalar(
        select(Escalation).where(
            Escalation.entity_type == entity_type,
            Escalation.entity_id == entity_id,
            Escalation.level == level,
        )
    )
    if existing is not None:
        return existing

    recipient = _recipient_for(session, str(entry.get("to", "")), institution)
    escalation = Escalation(
        entity_type=entity_type,
        entity_id=entity_id,
        level=level,
        to_user_id=recipient.id if recipient else None,
        triggered_at=now_utc(),
    )
    try:
        with session.begin_nested():
            session.add(escalation)
    except IntegrityError:
        return session.scalar(
            select(Escalation).where(
                Escalation.entity_type == entity_type,
                Escalation.entity_id == entity_id,
                Escalation.level == level,
            )
        )

    if recipient is not None:
        notify(
            session,
            user=recipient,
            template_key="escalation",
            context={
                "level": level,
                "entity": entity_label,
                "context": context,
            },
            entity_type="escalation",
            entity_id=escalation.id,
            trigger_key=f"escalation:{entity_type}:{entity_id}:level:{level}",
            trigger="escalation",
        )
    return escalation


def advance_open_escalations(session: Session, config: dict) -> int:
    """Move unacknowledged escalations to the next ladder level when due."""
    ladder = escalation_ladder(config)
    escalations = session.scalars(
        select(Escalation).where(
            Escalation.acknowledged_at.is_(None), Escalation.resolved_at.is_(None)
        )
    ).all()

    advanced = 0
    now = now_utc()
    for escalation in escalations:
        next_entry = next(
            (item for item in ladder if int(item.get("level", 0)) == escalation.level + 1), None
        )
        if next_entry is None:
            continue
        delay = timedelta(hours=float(next_entry.get("after_hours", 72)))
        if now - escalation.triggered_at < delay:
            continue

        institution = None
        if escalation.entity_type == "application":
            from app.models import Application

            application = session.get(Application, escalation.entity_id)
            institution = session.get(Institution, application.institution_id) if application else None

        create_escalation(
            session,
            config=config,
            entity_type=escalation.entity_type,
            entity_id=escalation.entity_id,
            level=escalation.level + 1,
            institution=institution,
            context="The previous level was not acknowledged in time.",
            entity_label=escalation.entity_type.replace("_", " "),
        )
        advanced += 1

    return advanced


def region_of(session: Session, institution: Institution | None) -> Region | None:
    if institution is None:
        return None
    return session.get(Region, institution.region_id)
