import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.db import get_session
from app.core.deps import get_current_user
from app.engines.audit import verify_chain
from app.engines.rules import published_rule, required_documents, resolve_route, rule_config
from app.engines.workflow import permitted_actions
from app.models import (
    Application,
    AuditEvent,
    Document,
    EvcCase,
    Expert,
    Institution,
    Obligation,
    Revert,
    RuleVersion,
    StageHistory,
    StageInstance,
    User,
)
from app.modules.applications import service
from app.modules.applications.schemas import (
    ApplicationDetail,
    ApplicationListItem,
    ApplicationMeta,
    ApplicationPage,
    CaseAction,
    CaseAuditItem,
    CaseDocument,
    CaseObligation,
    EvcInfo,
    HistoryItem,
    RevertInfo,
    StageInfo,
)

router = APIRouter(prefix="/applications", tags=["applications"])

TYPE_LABELS = {
    "new_institution": "new institution",
    "extension_of_approval": "extension of approval",
    "increase_in_intake": "increase in intake",
    "change_of_site": "change of site",
}

DUE_SUBQUERY = (
    select(StageInstance.due_at)
    .where(
        StageInstance.application_id == Application.id,
        StageInstance.completed_at.is_(None),
    )
    .order_by(StageInstance.entered_at.desc())
    .limit(1)
    .scalar_subquery()
)

SORTS = {
    "submitted_at": Application.submitted_at,
    "app_no": Application.app_no,
    "institution": Institution.name,
    "stage": Application.current_stage,
    "status": Application.status,
    "type": Application.type,
    "due_at": DUE_SUBQUERY,
}


@router.get("/meta", response_model=ApplicationMeta)
def application_meta(
    _: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> ApplicationMeta:
    version = published_rule(session)
    config = rule_config(version)
    types = list((config.get("application_types") or {}).keys())
    return ApplicationMeta(
        application_types={app_type: resolve_route(config, app_type) for app_type in types},
        required_documents={app_type: required_documents(config, app_type) for app_type in types},
        academic_year="2026-27",
        academic_years=["2026-27"],
        rule_version=f"{version.name} v{version.version}" if version else None,
    )


@router.get("", response_model=ApplicationPage)
def list_applications(
    stage: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    type_filter: str | None = Query(None, alias="type"),
    search: str | None = None,
    region_id: uuid.UUID | None = None,
    sort: str = "submitted_at",
    direction: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApplicationPage:
    if region_id is not None and user.role not in ("bureau_officer", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot filter by another region.",
        )
    conditions = service.filter_conditions(
        user, stage, status_filter, type_filter, search, region_id
    )
    order_column = SORTS.get(sort, Application.submitted_at)
    order = order_column.desc() if direction == "desc" else order_column.asc()

    total = (
        session.scalar(
            select(func.count())
            .select_from(Application)
            .join(Institution, Institution.id == Application.institution_id)
            .where(*conditions)
        )
        or 0
    )

    rows = session.execute(
        service.scoped_statement(user)
        .where(*conditions)
        .order_by(order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = service.build_items(session, rows)
    return ApplicationPage(
        items=[ApplicationListItem(**item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def _summary(
    application: Application,
    institution: Institution,
    stage_label: str,
    stage_age: int | None,
    target: int | None,
    documents: int,
    obligations: int,
) -> str:
    route = " then ".join(entry.replace("_", " ") for entry in (application.route or [])) or "scrutiny"
    type_label = TYPE_LABELS.get(application.type, application.type.replace("_", " "))
    age_text = (
        f"{stage_age} days into a {target} day target" if stage_age is not None else "no open clock"
    )
    return (
        f"{application.app_no} was filed by {institution.name} in {institution.district}, "
        f"{institution.state} as a {type_label} for {application.academic_year}. "
        f"The published route is {route}. The case sits at {stage_label}, {age_text}. "
        f"{documents} documents are on file and {obligations} undertakings follow from it. "
        "This summary is assembled from recorded data; it is not a decision."
    )


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application(
    application_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApplicationDetail:
    row = session.execute(
        service.scoped_statement(user).where(Application.id == application_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    application, institution, region = row
    item = service.build_items(session, [row])[0]
    now = now_utc()

    stage = session.scalar(
        select(StageInstance)
        .where(
            StageInstance.application_id == application.id,
            StageInstance.completed_at.is_(None),
        )
        .order_by(StageInstance.entered_at.desc())
    )
    stage_owner = session.get(User, stage.owner_user_id) if stage and stage.owner_user_id else None

    history_rows = session.execute(
        select(StageHistory, User.name)
        .outerjoin(User, User.id == StageHistory.actor_id)
        .where(StageHistory.application_id == application.id)
        .order_by(StageHistory.created_at)
    ).all()

    revert_rows = session.execute(
        select(Revert, User.name)
        .outerjoin(User, User.id == Revert.issued_by)
        .where(Revert.application_id == application.id)
        .order_by(Revert.due_at.desc())
    ).all()

    evc = session.scalar(select(EvcCase).where(EvcCase.application_id == application.id))

    documents = session.scalars(
        select(Document)
        .where(Document.application_id == application.id)
        .order_by(Document.created_at.desc())
    ).all()

    obligations = session.scalars(
        select(Obligation)
        .where(Obligation.application_id == application.id)
        .order_by(Obligation.due_at)
    ).all()

    audit_rows = session.execute(
        select(AuditEvent, User.name)
        .outerjoin(User, User.id == AuditEvent.actor_id)
        .where(
            AuditEvent.entity_type == "application",
            AuditEvent.entity_id == application.id,
        )
        .order_by(AuditEvent.id)
    ).all()

    version = (
        session.get(RuleVersion, application.rule_version_id)
        if application.rule_version_id
        else published_rule(session)
    )
    rule_version = f"{version.name} v{version.version}" if version else None

    deadline_days_left = None
    if stage is not None:
        deadline_days_left = int((stage.due_at - now).total_seconds() // 86400)

    chain = verify_chain(session)
    stage_label = service.stage_label(application.current_stage)

    return ApplicationDetail(
        **item,
        academic_year=application.academic_year,
        locked_fields=application.locked_fields,
        rule_version=rule_version,
        history=[
            HistoryItem(
                id=entry.id,
                from_stage=entry.from_stage,
                to_stage=entry.to_stage,
                reason=entry.reason,
                actor_name=actor_name,
                created_at=entry.created_at,
            )
            for entry, actor_name in history_rows
        ],
        open_stage=(
            StageInfo(
                stage=stage.stage,
                entered_at=stage.entered_at,
                due_at=stage.due_at,
                owner_name=stage_owner.name if stage_owner else None,
            )
            if stage
            else None
        ),
        reverts=[
            RevertInfo(
                id=revert.id,
                category=revert.category,
                required_evidence=revert.required_evidence,
                aph_reference=revert.aph_reference,
                due_at=revert.due_at,
                status=revert.status,
                issued_by_name=actor_name,
            )
            for revert, actor_name in revert_rows
        ],
        evc=(
            EvcInfo(
                status=evc.status,
                priority=evc.priority,
                queued_at=evc.queued_at,
                scheduled_for=evc.scheduled_for,
                completed_at=evc.completed_at,
                panel=[
                    expert.name
                    for expert in session.scalars(
                        select(Expert).where(
                            Expert.id.in_([uuid.UUID(str(value)) for value in evc.panel or []])
                        )
                    ).all()
                ],
            )
            if evc
            else None
        ),
        documents=[
            CaseDocument(
                id=document.id,
                type=document.type,
                version=document.version,
                file_name=document.original_name or document.file_path.rsplit("/", 1)[-1],
                issue_date=document.issue_date,
                expiry_date=document.expiry_date,
                dates_confirmed=document.dates_confirmed,
                verification_state=document.verification_state,
                created_at=document.created_at,
            )
            for document in documents
        ],
        obligations=[
            CaseObligation(
                id=obligation.id,
                type=obligation.type,
                title=obligation.title,
                state=obligation.state,
                due_at=obligation.due_at,
                evidence_required=obligation.evidence_required,
                source_ref=obligation.source_ref,
            )
            for obligation in obligations
        ],
        permitted_actions=[CaseAction(**action) for action in permitted_actions(session, user, application)],
        audit=[
            CaseAuditItem(
                id=event.id,
                action=event.action,
                at=event.at,
                actor_name=actor_name,
                role=event.role,
                hash=event.hash,
                prev_hash=event.prev_hash,
            )
            for event, actor_name in audit_rows
        ],
        audit_chain_valid=bool(chain["valid"]),
        deadline_days_left=deadline_days_left,
        summary=_summary(
            application,
            institution,
            stage_label,
            item["stage_age_days"],
            item["stage_target_days"],
            len(documents),
            len(obligations),
        ),
    )
