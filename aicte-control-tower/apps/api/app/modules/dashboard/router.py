from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.db import get_session
from app.core.deps import get_current_user
from app.models import Application, Institution, StageInstance, User
from app.modules.applications import service
from app.modules.applications.schemas import ApplicationListItem

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CLOSED_STATES = ("closed", "rejected")


class Overview(BaseModel):
    role: str
    scope_label: str
    applications: int
    active: int
    past_deadline: int
    due_next_7_days: int
    awaiting_you: int
    recent: list[ApplicationListItem]


def _open_stage_count(session: Session, user: User, extra) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(StageInstance)
            .join(Application, Application.id == StageInstance.application_id)
            .join(Institution, Institution.id == Application.institution_id)
            .where(StageInstance.completed_at.is_(None), *service.scope_conditions(user), *extra)
        )
        or 0
    )


@router.get("/overview", response_model=Overview)
def overview(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> Overview:
    now = now_utc()
    conditions = service.scope_conditions(user)

    applications = (
        session.scalar(
            select(func.count())
            .select_from(Application)
            .join(Institution, Institution.id == Application.institution_id)
            .where(*conditions)
        )
        or 0
    )
    active = (
        session.scalar(
            select(func.count())
            .select_from(Application)
            .join(Institution, Institution.id == Application.institution_id)
            .where(*conditions, Application.status.notin_(CLOSED_STATES))
        )
        or 0
    )

    past_deadline = _open_stage_count(session, user, [StageInstance.due_at < now])
    due_next_7 = _open_stage_count(
        session,
        user,
        [StageInstance.due_at >= now, StageInstance.due_at <= now + timedelta(days=7)],
    )

    rows = session.execute(
        service.scoped_statement(user).order_by(Application.submitted_at.desc()).limit(5)
    ).all()
    recent = [ApplicationListItem(**item) for item in service.build_items(session, rows)]

    scope_label = "All regions"
    if user.role == "institution":
        institution = session.get(Institution, user.institution_id) if user.institution_id else None
        scope_label = institution.name if institution else "Your institution"
    elif user.role in ("regional_officer", "evc_coordinator"):
        scope_label = "Your region"

    return Overview(
        role=user.role,
        scope_label=scope_label,
        applications=applications,
        active=active,
        past_deadline=past_deadline,
        due_next_7_days=due_next_7,
        awaiting_you=service.stage_owner_count(session, user),
        recent=recent,
    )
