"""Application lifecycle: routing, transitions, signed decisions and audit."""

import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.engines.audit import append_audit
from app.engines.deadlines import add_working_days, load_holidays
from app.engines.notify import notify
from app.engines.rules import (
    next_stage_for_route,
    published_rule,
    resolve_route,
    rule_config,
    target_days,
)
from app.models import (
    Application,
    EvcCase,
    Expert,
    Institution,
    Obligation,
    Region,
    Revert,
    RuleVersion,
    StageHistory,
    StageInstance,
    User,
)

STAGE_LABELS = {
    "draft": "Draft",
    "submitted": "Submitted",
    "scrutiny": "Scrutiny",
    "re_scrutiny": "Re-scrutiny",
    "reverted": "Reverted",
    "evc_queue": "EVC queue",
    "evc_scheduled": "EVC scheduled",
    "evc_completed": "EVC completed",
    "sac_shc": "SAC/SHC",
    "approval": "Awaiting approval",
    "approved_with_undertakings": "Approved with undertakings",
    "approved": "Approved",
    "closed": "Closed",
}


class WorkflowError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _institution(session: Session, application: Application) -> Institution:
    institution = session.get(Institution, application.institution_id)
    if institution is None:
        raise WorkflowError(404, "Institution not found.")
    return institution


def region_scope_ok(session: Session, user: User, institution: Institution) -> bool:
    if user.role == "institution":
        return user.institution_id == institution.id
    if user.role in ("regional_officer", "evc_coordinator"):
        return user.region_id == institution.region_id
    return user.role in ("bureau_officer", "admin")


def _regional_officer(session: Session, institution: Institution) -> User | None:
    return session.scalar(
        select(User).where(
            User.role == "regional_officer",
            User.region_id == institution.region_id,
            User.active.is_(True),
        )
    )


def _evc_coordinator(session: Session, institution: Institution) -> User | None:
    return session.scalar(
        select(User).where(
            User.role == "evc_coordinator",
            User.region_id == institution.region_id,
            User.active.is_(True),
        )
    ) or _regional_officer(session, institution)


def _bureau_officer(session: Session) -> User | None:
    return session.scalar(
        select(User).where(User.role == "bureau_officer", User.active.is_(True))
    )


def _institution_user(session: Session, institution: Institution) -> User | None:
    return session.scalar(
        select(User).where(
            User.role == "institution", User.institution_id == institution.id, User.active.is_(True)
        )
    )


def _next_app_no(session: Session) -> str:
    latest = session.scalar(select(func.max(Application.app_no)))
    try:
        number = int(latest.rsplit("/", 1)[1]) + 1 if latest else 1
    except (AttributeError, ValueError):
        number = 1
    return f"AICTE/2026/{number:03d}"


def open_stage(session: Session, application: Application) -> StageInstance | None:
    return session.scalar(
        select(StageInstance)
        .where(
            StageInstance.application_id == application.id,
            StageInstance.completed_at.is_(None),
        )
        .order_by(StageInstance.entered_at.desc())
    )


def _close_stage(session: Session, application: Application, outcome: str) -> None:
    stage = open_stage(session, application)
    if stage is not None:
        stage.completed_at = now_utc()
        stage.outcome = outcome
        session.add(stage)


def _open_stage(
    session: Session,
    application: Application,
    stage_name: str,
    config: dict,
    owner: User | None,
    holidays: set,
) -> StageInstance:
    started = now_utc()
    due = add_working_days(started, target_days(config, stage_name), holidays)
    stage = StageInstance(
        application_id=application.id,
        stage=stage_name,
        entered_at=started,
        due_at=due,
        owner_user_id=owner.id if owner else None,
    )
    session.add(stage)
    application.current_stage = stage_name
    return stage


def _history(
    session: Session,
    application: Application,
    from_stage: str | None,
    to_stage: str,
    actor: User | None,
    reason: str,
) -> None:
    session.add(
        StageHistory(
            application_id=application.id,
            from_stage=from_stage,
            to_stage=to_stage,
            actor_id=actor.id if actor else None,
            reason=reason,
        )
    )


def create_application(
    session: Session, user: User, app_type: str, academic_year: str = "2026-27"
) -> Application:
    if user.role != "institution" or user.institution_id is None:
        raise WorkflowError(403, "Only an institution can file an application.")
    version = published_rule(session)
    config = rule_config(version)
    if app_type not in (config.get("application_types") or {}):
        raise WorkflowError(400, "That application type is not in the published rules.")

    application = Application(
        app_no=_next_app_no(session),
        institution_id=user.institution_id,
        type=app_type,
        academic_year=academic_year,
        route=resolve_route(config, app_type),
        current_stage="draft",
        rule_version_id=version.id if version else None,
        status="draft",
        locked_fields=[],
    )
    session.add(application)
    session.flush()

    append_audit(
        session,
        actor=user,
        action="application.created",
        entity_type="application",
        entity_id=application.id,
        payload={"app_no": application.app_no, "type": app_type, "route": application.route},
    )
    return application


def submit_application(session: Session, user: User, application: Application) -> Application:
    institution = _institution(session, application)
    if not region_scope_ok(session, user, institution) or user.role != "institution":
        raise WorkflowError(403, "Only the owning institution can submit this application.")
    if application.status != "draft":
        raise WorkflowError(400, "This application has already been submitted.")

    version = (
        session.get(RuleVersion, application.rule_version_id)
        if application.rule_version_id
        else None
    ) or published_rule(session)
    config = rule_config(version)
    holidays = load_holidays(session)
    owner = _regional_officer(session, institution) or _bureau_officer(session)

    application.status = "in_progress"
    application.submitted_at = now_utc()
    _open_stage(session, application, "scrutiny", config, owner, holidays)
    _history(session, application, "draft", "scrutiny", user, "Application submitted and routed.")
    append_audit(
        session,
        actor=user,
        action="application.submitted",
        entity_type="application",
        entity_id=application.id,
        payload={"app_no": application.app_no, "route": application.route},
    )

    if owner is not None:
        notify(
            session,
            user=owner,
            template_key="application_submitted",
            context={"app_no": application.app_no, "institution": institution.name},
            entity_type="application",
            entity_id=application.id,
            trigger_key="submitted",
            trigger="workflow",
        )
    return application


def revert_application(
    session: Session,
    user: User,
    application: Application,
    *,
    category: str,
    required_evidence: str,
    due_days: int,
    aph_reference: str,
) -> Revert:
    institution = _institution(session, application)
    if user.role != "regional_officer" or not region_scope_ok(session, user, institution):
        raise WorkflowError(403, "Only the Regional Officer for this region can revert the case.")
    if application.current_stage not in ("scrutiny", "re_scrutiny"):
        raise WorkflowError(400, "A case can only be reverted while it is in scrutiny.")

    holidays = load_holidays(session)
    due = add_working_days(now_utc(), max(1, due_days), holidays)
    revert = Revert(
        application_id=application.id,
        issued_by=user.id,
        category=category,
        aph_reference=aph_reference or "To be mapped from APH 2024-27",
        required_evidence=required_evidence,
        due_at=due,
        status="open",
    )
    session.add(revert)
    session.flush()

    _close_stage(session, application, "reverted")
    application.current_stage = "reverted"
    application.status = "reverted"
    application.locked_fields = ["institution_name", "state", "district"]
    _history(session, application, "scrutiny", "reverted", user, category)
    append_audit(
        session,
        actor=user,
        action="application.reverted",
        entity_type="application",
        entity_id=application.id,
        payload={
            "category": category,
            "required_evidence": required_evidence,
            "aph_reference": revert.aph_reference,
            "due_at": due.isoformat(),
            "signed": True,
        },
    )

    applicant = _institution_user(session, institution)
    if applicant is not None:
        notify(
            session,
            user=applicant,
            template_key="application_reverted",
            context={"app_no": application.app_no, "due_date": due.strftime("%d %b %Y")},
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"reverted:{revert.id}",
            trigger="workflow",
        )
    return revert


def resubmit_application(session: Session, user: User, application: Application) -> Application:
    institution = _institution(session, application)
    if user.role != "institution" or user.institution_id != institution.id:
        raise WorkflowError(403, "Only the owning institution can resubmit this case.")
    if application.status != "reverted":
        raise WorkflowError(400, "This case is not waiting for a resubmission.")

    revert = session.scalar(
        select(Revert)
        .where(Revert.application_id == application.id, Revert.status == "open")
        .order_by(Revert.due_at.desc())
    )
    if revert is None:
        raise WorkflowError(400, "There is no open revert on this case.")

    revert.status = "resolved"
    revert.resolved_at = now_utc()

    config = rule_config(published_rule(session))
    holidays = load_holidays(session)
    officer = session.get(User, revert.issued_by)
    _open_stage(session, application, "re_scrutiny", config, officer, holidays)
    application.status = "in_progress"
    application.locked_fields = []
    _history(session, application, "reverted", "re_scrutiny", user, "Evidence resubmitted.")
    append_audit(
        session,
        actor=user,
        action="application.resubmitted",
        entity_type="application",
        entity_id=application.id,
        payload={"app_no": application.app_no, "returned_to": str(revert.issued_by)},
    )

    if officer is not None:
        notify(
            session,
            user=officer,
            template_key="application_resubmitted",
            context={"app_no": application.app_no, "institution": institution.name},
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"resubmitted:{revert.id}",
            trigger="workflow",
        )
    return application


def clear_application(session: Session, user: User, application: Application) -> Application:
    institution = _institution(session, application)
    if user.role != "regional_officer" or not region_scope_ok(session, user, institution):
        raise WorkflowError(403, "Only the Regional Officer for this region can clear scrutiny.")
    if application.current_stage not in ("scrutiny", "re_scrutiny"):
        raise WorkflowError(400, "Only a case in scrutiny can be cleared.")

    config = rule_config(published_rule(session))
    holidays = load_holidays(session)
    next_stage = next_stage_for_route(list(application.route or []), application.current_stage, "scrutiny")

    _close_stage(session, application, "cleared")
    application.status = "in_progress"

    if next_stage == "evc_queue":
        owner = _evc_coordinator(session, institution)
        _open_stage(session, application, "evc_queue", config, owner, holidays)
        priority = 1 if application.type == "new_institution" else 3
        existing = session.scalar(
            select(EvcCase).where(EvcCase.application_id == application.id)
        )
        if existing is None:
            session.add(
                EvcCase(
                    application_id=application.id,
                    queued_at=now_utc(),
                    priority=priority,
                    status="queued",
                    panel=[],
                )
            )
    elif next_stage == "sac_shc":
        owner = _bureau_officer(session)
        _open_stage(session, application, "sac_shc", config, owner, holidays)
    else:
        owner = _bureau_officer(session)
        _open_stage(session, application, "approval", config, owner, holidays)

    _history(session, application, "scrutiny", application.current_stage, user, "Scrutiny cleared.")
    append_audit(
        session,
        actor=user,
        action="application.scrutiny_cleared",
        entity_type="application",
        entity_id=application.id,
        payload={"next_stage": application.current_stage, "signed": True},
    )

    if owner is not None:
        notify(
            session,
            user=owner,
            template_key="application_cleared",
            context={
                "app_no": application.app_no,
                "institution": institution.name,
                "stage": STAGE_LABELS.get(application.current_stage, application.current_stage),
            },
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"cleared:{application.current_stage}",
            trigger="workflow",
        )
    return application


def schedule_evc(
    session: Session,
    user: User,
    evc_case: EvcCase,
    *,
    scheduled_for,
    expert_ids: list[uuid.UUID],
    notes: str = "",
) -> EvcCase:
    """Record a visit date and panel. No decision is taken here."""
    application = session.get(Application, evc_case.application_id)
    if application is None:
        raise WorkflowError(404, "Application not found.")
    institution = _institution(session, application)
    if user.role not in ("evc_coordinator", "admin") or not region_scope_ok(
        session, user, institution
    ):
        raise WorkflowError(403, "Only the EVC Coordinator for this region can schedule a visit.")
    if application.current_stage not in ("evc_queue", "evc_scheduled"):
        raise WorkflowError(400, "This case is not waiting for an Expert Visit Committee.")
    if scheduled_for <= now_utc():
        raise WorkflowError(400, "Choose a visit date and time in the future.")

    wanted = list(dict.fromkeys(expert_ids))
    if not wanted or len(wanted) > 3:
        raise WorkflowError(400, "Name one to three experts on the panel.")

    experts = session.scalars(select(Expert).where(Expert.id.in_(wanted))).all()
    if len(experts) != len(wanted):
        raise WorkflowError(404, "One of the selected experts no longer exists.")
    for expert in experts:
        if expert.home_district.strip().lower() == (institution.district or "").strip().lower():
            raise WorkflowError(
                400,
                f"{expert.name} lives in {expert.home_district}, the same district as the "
                "institution, so cannot sit on this panel.",
            )

    config = rule_config(published_rule(session))
    holidays = load_holidays(session)
    if application.current_stage == "evc_queue":
        _close_stage(session, application, "scheduled")
        _open_stage(session, application, "evc_scheduled", config, user, holidays)
        _history(
            session,
            application,
            "evc_queue",
            "evc_scheduled",
            user,
            "Visit scheduled with an expert panel.",
        )

    evc_case.scheduled_for = scheduled_for
    evc_case.panel = [str(expert.id) for expert in experts]
    evc_case.status = "scheduled"
    session.add(evc_case)

    append_audit(
        session,
        actor=user,
        action="evc.scheduled",
        entity_type="application",
        entity_id=application.id,
        payload={
            "scheduled_for": scheduled_for.isoformat(),
            "panel": [expert.name for expert in experts],
            "notes": notes[:500],
        },
    )

    applicant = _institution_user(session, institution)
    if applicant is not None:
        notify(
            session,
            user=applicant,
            template_key="evc_scheduled",
            context={
                "app_no": application.app_no,
                "institution": institution.name,
                "date": scheduled_for.strftime("%d %b %Y, %H:%M"),
            },
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"evc_scheduled:{evc_case.id}:{scheduled_for.date().isoformat()}",
            trigger="workflow",
        )
    return evc_case


def complete_evc(
    session: Session,
    user: User,
    evc_case: EvcCase,
    *,
    outcome: str,
    recommendation: str,
    report_document_id: uuid.UUID | None,
) -> EvcCase:
    """Record that the visit took place. The recommendation is advice, not a decision."""
    application = session.get(Application, evc_case.application_id)
    if application is None:
        raise WorkflowError(404, "Application not found.")
    institution = _institution(session, application)
    if user.role not in ("evc_coordinator", "admin") or not region_scope_ok(
        session, user, institution
    ):
        raise WorkflowError(403, "Only the EVC Coordinator for this region can close a visit.")
    if evc_case.status != "scheduled" or evc_case.scheduled_for is None:
        raise WorkflowError(400, "Schedule the visit before recording its outcome.")
    if outcome not in ("recommended_for_approval", "deficiencies_found", "not_visited"):
        raise WorkflowError(400, "Choose an outcome for the visit.")
    if len(recommendation.strip()) < 10:
        raise WorkflowError(400, "Record what the committee found before closing the visit.")

    config = rule_config(published_rule(session))
    holidays = load_holidays(session)
    evc_case.completed_at = now_utc()
    evc_case.status = "completed"
    session.add(evc_case)

    _close_stage(session, application, outcome)
    route = list(application.route or [])
    nxt = next_stage_for_route(route, application.current_stage, "evc") or "approval"
    owner = _bureau_officer(session) if nxt in ("approval", "sac_shc") else user
    _open_stage(session, application, nxt, config, owner, holidays)
    if evc_case.report_doc_id is None and report_document_id is not None:
        evc_case.report_doc_id = report_document_id
    _history(
        session,
        application,
        "evc_scheduled",
        nxt,
        user,
        f"Visit completed: {outcome.replace('_', ' ')}.",
    )
    append_audit(
        session,
        actor=user,
        action="evc.completed",
        entity_type="application",
        entity_id=application.id,
        payload={
            "outcome": outcome,
            "recommendation": recommendation[:1000],
            "report_document_id": str(report_document_id) if report_document_id else None,
            "signed": True,
        },
    )

    if owner is not None:
        notify(
            session,
            user=owner,
            template_key="application_cleared",
            context={
                "app_no": application.app_no,
                "institution": institution.name,
                "stage": STAGE_LABELS.get(nxt, nxt),
            },
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"evc_completed:{evc_case.id}",
            trigger="workflow",
        )
    return evc_case


def approve_application(
    session: Session,
    user: User,
    application: Application,
    conditions: list[dict],
) -> Application:
    institution = _institution(session, application)
    if user.role != "bureau_officer":
        raise WorkflowError(403, "Only a Bureau Officer can sign an approval.")
    if application.current_stage != "approval":
        raise WorkflowError(400, "This case is not in the approval queue.")

    now = now_utc()
    _close_stage(session, application, "approved")
    application.current_stage = "approved_with_undertakings"
    application.status = "approved"
    applicant = _institution_user(session, institution)

    for condition in conditions:
        days = max(1, int(condition.get("due_days", 90)))
        session.add(
            Obligation(
                institution_id=institution.id,
                application_id=application.id,
                type="approval_condition",
                title=str(condition.get("title", "Approval condition")),
                source_ref=str(condition.get("source_ref") or "To be mapped from APH 2024-27"),
                evidence_required=str(condition.get("evidence_required", "Supporting document")),
                due_at=now + timedelta(days=days),
                state="not_due",
                owner_user_id=applicant.id if applicant else None,
            )
        )

    _history(
        session,
        application,
        "approval",
        "approved_with_undertakings",
        user,
        f"Approved with {len(conditions)} undertakings.",
    )
    append_audit(
        session,
        actor=user,
        action="application.approved",
        entity_type="application",
        entity_id=application.id,
        payload={"conditions": len(conditions), "signed": True},
    )

    if applicant is not None:
        notify(
            session,
            user=applicant,
            template_key="application_approved",
            context={
                "app_no": application.app_no,
                "institution": institution.name,
                "count": len(conditions),
            },
            entity_type="application",
            entity_id=application.id,
            trigger_key=f"approved:{application.id}",
            trigger="workflow",
        )
    return application


def permitted_actions(session: Session, user: User, application: Application) -> list[dict]:
    institution = _institution(session, application)
    actions: list[dict] = []

    if user.role == "institution" and user.institution_id == institution.id:
        if application.status == "draft":
            actions.append({"event": "submit", "label": "Submit application", "signed": False})
        if application.status == "reverted":
            actions.append({"event": "resubmit", "label": "Resubmit evidence", "signed": False})

    if user.role == "regional_officer" and region_scope_ok(session, user, institution):
        if application.current_stage in ("scrutiny", "re_scrutiny"):
            actions.append({"event": "revert", "label": "Revert to institution", "signed": True})
            actions.append({"event": "clear", "label": "Clear scrutiny", "signed": True})

    if user.role == "bureau_officer" and application.current_stage == "approval":
        actions.append({"event": "approve", "label": "Sign approval", "signed": True})

    return actions
