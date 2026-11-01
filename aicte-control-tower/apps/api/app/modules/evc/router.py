"""Expert Visit Committee: queue, expert pool, scheduling and visit outcome."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.signing import verify_sign_token
from app.engines import workflow
from app.engines.workflow import WorkflowError
from app.models import Application, EvcCase, Expert, Institution, Region, User

router = APIRouter(prefix="/evc", tags=["evc"])

OFFICIAL_ROLES = ("evc_coordinator", "admin", "bureau_officer", "regional_officer")


class PanelMember(BaseModel):
    id: uuid.UUID
    name: str
    home_district: str
    home_institution: str


class EvcQueueItem(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    app_no: str
    institution_name: str
    district: str
    region_name: str
    type: str
    status: str
    priority: int
    queued_at: datetime
    scheduled_for: datetime | None
    completed_at: datetime | None
    panel: list[PanelMember]
    conflict_ids: list[uuid.UUID]


class ScheduleRequest(BaseModel):
    scheduled_for: datetime
    expert_ids: list[uuid.UUID] = Field(min_length=1, max_length=3)
    notes: str = Field(default="", max_length=500)


class CompleteRequest(BaseModel):
    outcome: str
    recommendation: str = Field(min_length=10, max_length=2000)
    report_document_id: uuid.UUID | None = None


def _scope(session: Session, user: User):
    statement = (
        select(EvcCase, Application, Institution, Region)
        .join(Application, Application.id == EvcCase.application_id)
        .join(Institution, Institution.id == Application.institution_id)
        .join(Region, Region.id == Institution.region_id)
    )
    if user.role in ("evc_coordinator", "regional_officer"):
        statement = statement.where(Institution.region_id == user.region_id)
    elif user.role == "institution":
        statement = statement.where(Application.institution_id == user.institution_id)
    return statement


def _panel(session: Session, evc_case: EvcCase) -> list[PanelMember]:
    members: list[PanelMember] = []
    for value in evc_case.panel or []:
        try:
            expert = session.get(Expert, uuid.UUID(str(value)))
        except ValueError:
            expert = None
        if expert is not None:
            members.append(
                PanelMember(
                    id=expert.id,
                    name=expert.name,
                    home_district=expert.home_district,
                    home_institution=expert.home_institution,
                )
            )
    return members


@router.get("/queue", response_model=list[EvcQueueItem])
def evc_queue(
    include_completed: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[EvcQueueItem]:
    if user.role not in OFFICIAL_ROLES:
        raise HTTPException(status_code=403, detail="The EVC queue is visible to officials.")
    statement = _scope(session, user)
    if not include_completed:
        statement = statement.where(EvcCase.status != "completed")

    rows = session.execute(statement.order_by(EvcCase.priority, EvcCase.queued_at)).all()
    items: list[EvcQueueItem] = []
    for evc_case, application, institution, region in rows:
        pool = session.scalars(
            select(Expert).where(Expert.region_id == region.id, Expert.active.is_(True))
        ).all()
        district = (institution.district or "").strip().lower()
        items.append(
            EvcQueueItem(
                id=evc_case.id,
                application_id=application.id,
                app_no=application.app_no,
                institution_name=institution.name,
                district=institution.district or "",
                region_name=region.name,
                type=application.type,
                status=evc_case.status,
                priority=evc_case.priority,
                queued_at=evc_case.queued_at,
                scheduled_for=evc_case.scheduled_for,
                completed_at=evc_case.completed_at,
                panel=_panel(session, evc_case),
                conflict_ids=[
                    expert.id
                    for expert in pool
                    if expert.home_district.strip().lower() == district
                ],
            )
        )
    return items


@router.get("/experts", response_model=list[PanelMember])
def experts(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[PanelMember]:
    if user.role not in OFFICIAL_ROLES:
        raise HTTPException(status_code=403, detail="The expert pool is visible to officials.")
    statement = select(Expert).where(Expert.active.is_(True))
    if user.role in ("evc_coordinator", "regional_officer"):
        statement = statement.where(Expert.region_id == user.region_id)
    rows = session.scalars(statement.order_by(Expert.name)).all()
    return [
        PanelMember(
            id=expert.id,
            name=expert.name,
            home_district=expert.home_district,
            home_institution=expert.home_institution,
        )
        for expert in rows
    ]


def _case(session: Session, case_id: uuid.UUID, user: User) -> tuple[EvcCase, Application]:
    row = session.execute(
        _scope(session, user).where(EvcCase.id == case_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="EVC case not found.")
    evc_case, application = row[0], row[1]
    return evc_case, application


@router.post("/{case_id}/schedule", response_model=EvcQueueItem)
def schedule_visit(
    case_id: uuid.UUID,
    payload: ScheduleRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> EvcQueueItem:
    evc_case, _ = _case(session, case_id, user)
    scheduled_for = payload.scheduled_for
    if scheduled_for.tzinfo is None:
        scheduled_for = scheduled_for.replace(tzinfo=UTC)
    try:
        workflow.schedule_evc(
            session,
            user,
            evc_case,
            scheduled_for=scheduled_for,
            expert_ids=payload.expert_ids,
            notes=payload.notes,
        )
        session.commit()
    except WorkflowError as error:
        session.rollback()
        raise HTTPException(status_code=error.status_code, detail=error.detail)
    return _one(session, user, case_id)


@router.post("/{case_id}/complete", response_model=EvcQueueItem)
def complete_visit(
    case_id: uuid.UUID,
    payload: CompleteRequest,
    x_sign_token: str | None = Header(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> EvcQueueItem:
    if not x_sign_token or not verify_sign_token(x_sign_token, str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign this record with your password before closing the visit.",
        )
    evc_case, _ = _case(session, case_id, user)
    try:
        workflow.complete_evc(
            session,
            user,
            evc_case,
            outcome=payload.outcome,
            recommendation=payload.recommendation,
            report_document_id=payload.report_document_id,
        )
        session.commit()
    except WorkflowError as error:
        session.rollback()
        raise HTTPException(status_code=error.status_code, detail=error.detail)
    return _one(session, user, case_id)


def _one(session: Session, user: User, case_id: uuid.UUID) -> EvcQueueItem:
    row = session.execute(_scope(session, user).where(EvcCase.id == case_id)).first()
    assert row is not None
    evc_case, application, institution, region = row
    pool = session.scalars(
        select(Expert).where(Expert.region_id == region.id, Expert.active.is_(True))
    ).all()
    district = (institution.district or "").strip().lower()
    return EvcQueueItem(
        id=evc_case.id,
        application_id=application.id,
        app_no=application.app_no,
        institution_name=institution.name,
        district=institution.district or "",
        region_name=region.name,
        type=application.type,
        status=evc_case.status,
        priority=evc_case.priority,
        queued_at=evc_case.queued_at,
        scheduled_for=evc_case.scheduled_for,
        completed_at=evc_case.completed_at,
        panel=_panel(session, evc_case),
        conflict_ids=[
            expert.id for expert in pool if expert.home_district.strip().lower() == district
        ],
    )


@router.get("/calendar", response_model=list[EvcQueueItem])
def calendar(
    days: int = 45,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[EvcQueueItem]:
    """Scheduled visits in the next `days` days, earliest first."""
    if user.role not in OFFICIAL_ROLES:
        raise HTTPException(status_code=403, detail="The EVC calendar is visible to officials.")
    horizon = datetime.now(UTC) + timedelta(days=max(1, min(days, 120)))
    rows = session.execute(
        _scope(session, user)
        .where(EvcCase.scheduled_for.is_not(None), EvcCase.scheduled_for <= horizon)
        .order_by(EvcCase.scheduled_for)
    ).all()
    items: list[EvcQueueItem] = []
    for evc_case, application, institution, region in rows:
        pool = session.scalars(
            select(Expert).where(Expert.region_id == region.id, Expert.active.is_(True))
        ).all()
        district = (institution.district or "").strip().lower()
        items.append(
            EvcQueueItem(
                id=evc_case.id,
                application_id=application.id,
                app_no=application.app_no,
                institution_name=institution.name,
                district=institution.district or "",
                region_name=region.name,
                type=application.type,
                status=evc_case.status,
                priority=evc_case.priority,
                queued_at=evc_case.queued_at,
                scheduled_for=evc_case.scheduled_for,
                completed_at=evc_case.completed_at,
                panel=_panel(session, evc_case),
                conflict_ids=[
                    expert.id
                    for expert in pool
                    if expert.home_district.strip().lower() == district
                ],
            )
        )
    return items

