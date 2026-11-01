"""The seven monitoring checks run by the scheduler on every tick.

Every check only raises notifications and escalations. Nothing here approves,
rejects, closes or penalises an institution; those stay with officials.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.engines.escalation import advance_open_escalations, create_escalation
from app.engines.notify import notify
from app.engines.rules import (
    published_rule,
    reminders_days,
    rule_config,
    stage_for_route_entry,
    target_days,
)
from app.models import (
    Application,
    Document,
    EvcCase,
    Institution,
    Obligation,
    Revert,
    StageInstance,
    User,
)

logger = logging.getLogger("aicte.monitor")

WARNING_THRESHOLD = 0.8
OBLIGATION_SOON_DAYS = 30
# One monitor run at a time: the web process and the scheduler can tick together.
RUN_LOCK_ID = 918_273


def _user_for_role(session: Session, role: str, institution: Institution | None) -> User | None:
    if institution is None:
        return None
    if role == "institution":
        return session.scalar(
            select(User).where(
                User.role == "institution",
                User.institution_id == institution.id,
                User.active.is_(True),
            )
        )
    if role in ("regional_officer", "evc_coordinator"):
        return session.scalar(
            select(User).where(
                User.role == role,
                User.region_id == institution.region_id,
                User.active.is_(True),
            )
        )
    return None


def _stage_checks(session: Session, now: datetime, config: dict) -> tuple[int, int]:
    warnings = 0
    overdue = 0
    stages = session.scalars(
        select(StageInstance).where(StageInstance.completed_at.is_(None))
    ).all()

    for stage in stages:
        application = session.get(Application, stage.application_id)
        if application is None:
            continue
        institution = session.get(Institution, application.institution_id)
        window = (stage.due_at - stage.entered_at).total_seconds()
        if window <= 0:
            ratio = 1.0
        else:
            ratio = (now - stage.entered_at).total_seconds() / window

        owner = session.get(User, stage.owner_user_id) if stage.owner_user_id else None
        if owner is None and institution is not None:
            owner = _user_for_role(session, "regional_officer", institution)
        if owner is None:
            continue

        label = stage.stage.replace("_", " ")
        if now >= stage.due_at:
            notify(
                session,
                user=owner,
                template_key="stage_overdue",
                context={
                    "app_no": application.app_no,
                    "stage": label,
                    "days": max(1, (now - stage.due_at).days),
                },
                entity_type="application",
                entity_id=application.id,
                trigger_key=f"stage-overdue:{stage.id}",
                trigger="scheduler",
            )
            if create_escalation(
                session,
                config=config,
                entity_type="application",
                entity_id=application.id,
                level=1,
                institution=institution,
                context=f"{application.app_no} is past its {label} target.",
                entity_label=application.app_no,
            ):
                overdue += 1
        elif ratio >= WARNING_THRESHOLD:
            notify(
                session,
                user=owner,
                template_key="stage_warning",
                context={
                    "app_no": application.app_no,
                    "stage": label,
                    "percent": int(min(ratio, 0.99) * 100),
                    "target": target_days(config, stage.stage),
                },
                entity_type="application",
                entity_id=application.id,
                trigger_key=f"stage-warning:{stage.id}",
                trigger="scheduler",
            )
            warnings += 1

    return warnings, overdue


def _obligation_checks(session: Session, now: datetime, config: dict) -> tuple[int, int]:
    reminders = sorted(reminders_days(config), reverse=True)
    due_soon = 0
    overdue = 0
    obligations = session.scalars(
        select(Obligation).where(Obligation.state.notin_(("verified", "closed")))
    ).all()

    for obligation in obligations:
        institution = session.get(Institution, obligation.institution_id)
        applicant = _user_for_role(session, "institution", institution)
        if applicant is None:
            continue
        days_left = (obligation.due_at - now).days
        due_date = obligation.due_at.strftime("%d %b %Y")

        if days_left < 0:
            if obligation.state != "overdue":
                obligation.state = "overdue"
            notify(
                session,
                user=applicant,
                template_key="obligation_overdue",
                context={
                    "title": obligation.title,
                    "institution": institution.name if institution else "",
                    "due_date": due_date,
                },
                entity_type="obligation",
                entity_id=obligation.id,
                trigger_key=f"obligation-overdue:{obligation.id}",
                trigger="scheduler",
            )
            overdue += 1
            continue

        threshold = next((value for value in reminders if days_left <= value), None)
        if threshold is None:
            continue
        if obligation.state == "not_due" and days_left <= OBLIGATION_SOON_DAYS:
            obligation.state = "due_soon"
        notify(
            session,
            user=applicant,
            template_key="obligation_due",
            context={
                "title": obligation.title,
                "institution": institution.name if institution else "",
                "due_date": due_date,
            },
            entity_type="obligation",
            entity_id=obligation.id,
            trigger_key=f"obligation-due:{obligation.id}:{threshold}",
            trigger="scheduler",
        )
        due_soon += 1

    return due_soon, overdue


def _document_checks(session: Session, now: datetime, config: dict) -> int:
    reminders = reminders_days(config)
    sent = 0
    documents = session.scalars(
        select(Document).where(Document.expiry_date.is_not(None), Document.dates_confirmed.is_(True))
    ).all()

    for document in documents:
        expiry = datetime.combine(document.expiry_date, datetime.min.time(), tzinfo=now.tzinfo)
        days_left = (expiry - now).days
        if days_left < 0:
            threshold = 0
        else:
            threshold = next((value for value in reminders if days_left <= value), None)
            if threshold is None:
                continue
        institution = session.get(Institution, document.institution_id)
        if institution is None:
            continue
        recipients = [
            recipient
            for recipient in (
                _user_for_role(session, "institution", institution),
                _user_for_role(session, "regional_officer", institution),
            )
            if recipient is not None
        ]
        for recipient in recipients:
            notify(
                session,
                user=recipient,
                template_key="document_expiry",
                context={
                    "document_type": document.type.replace("_", " "),
                    "institution": institution.name,
                    "expiry_date": document.expiry_date.strftime("%d %b %Y"),
                },
                entity_type="document",
                entity_id=document.id,
                trigger_key=f"document-expiry:{document.id}:{document.expiry_date}",
                trigger="scheduler",
            )
            sent += 1
    return sent


def _revert_checks(session: Session, now: datetime) -> int:
    sent = 0
    reverts = session.scalars(select(Revert).where(Revert.status == "open")).all()
    for revert in reverts:
        if revert.due_at >= now:
            continue
        application = session.get(Application, revert.application_id)
        officer = session.get(User, revert.issued_by)
        if application is None or officer is None:
            continue
        institution = session.get(Institution, application.institution_id)
        notify(
            session,
            user=officer,
            template_key="revert_overdue",
            context={
                "institution": institution.name if institution else "",
                "app_no": application.app_no,
                "due_date": revert.due_at.strftime("%d %b %Y"),
            },
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"revert-overdue:{revert.id}",
            trigger="scheduler",
        )
        sent += 1
    return sent


def _evc_checks(session: Session, now: datetime, config: dict) -> int:
    sent = 0
    cases = session.scalars(
        select(EvcCase).where(EvcCase.status == "queued", EvcCase.scheduled_for.is_(None))
    ).all()
    for case in cases:
        application = session.get(Application, case.application_id)
        if application is None:
            continue
        institution = session.get(Institution, application.institution_id)
        coordinator = _user_for_role(session, "evc_coordinator", institution)
        if coordinator is None:
            continue
        waiting = max(0, (now - case.queued_at).days)
        target = target_days(config, stage_for_route_entry("evc_queue"))
        if waiting < max(1, int(target * WARNING_THRESHOLD)):
            continue
        notify(
            session,
            user=coordinator,
            template_key="evc_unscheduled",
            context={"app_no": application.app_no, "days": waiting, "target": target},
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"evc-unscheduled:{case.id}",
            trigger="scheduler",
        )
        sent += 1
    return sent


def run_checks(session: Session, now: datetime | None = None) -> dict[str, int]:
    """Run all seven checks once. Safe to call repeatedly and concurrently."""
    locked = session.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": RUN_LOCK_ID})
    if not locked:
        logger.info("monitor run skipped, another run holds the lock")
        return {"skipped_concurrent_run": 1}

    now = now or now_utc()
    version = published_rule(session)
    config = rule_config(version)

    warnings, overdue_stages = _stage_checks(session, now, config)
    advanced = advance_open_escalations(session, config)
    obligations_due, obligations_overdue = _obligation_checks(session, now, config)
    documents = _document_checks(session, now, config)
    reverts = _revert_checks(session, now)
    evc = _evc_checks(session, now, config)

    result = {
        "stage_warnings": warnings,
        "stage_overdue": overdue_stages,
        "escalations_advanced": advanced,
        "obligations_due": obligations_due,
        "obligations_overdue": obligations_overdue,
        "documents_expiring": documents,
        "reverts_overdue": reverts,
        "evc_unscheduled": evc,
    }
    logger.info("monitor run %s", result)
    return result
