from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.db import get_session
from app.models import Application, Institution, Notification, Obligation, Region, StageInstance
from app.modules.applications import service

router = APIRouter(prefix="/public", tags=["public"])

CLOSED_STATES = ("closed", "rejected")


class WeeklyPoint(BaseModel):
    week_start: str
    count: int


class PublicSummary(BaseModel):
    applications_tracked: int
    active: int
    past_deadline: int
    due_in_7_days: int
    regions: int
    obligations_monitored: int
    alerts_raised: int
    applications_by_week: list[WeeklyPoint]
    as_of: str


def _open_count(session: Session, extra) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(StageInstance)
            .where(StageInstance.completed_at.is_(None), *extra)
        )
        or 0
    )


@router.get("/summary", response_model=PublicSummary)
def summary(session: Session = Depends(get_session)) -> PublicSummary:
    now = now_utc()
    applications = session.scalar(select(func.count()).select_from(Application)) or 0
    active = (
        session.scalar(
            select(func.count())
            .select_from(Application)
            .where(Application.status.notin_(CLOSED_STATES))
        )
        or 0
    )
    past_deadline = _open_count(session, [StageInstance.due_at < now])
    due_next_7 = _open_count(
        session,
        [StageInstance.due_at >= now, StageInstance.due_at <= now + timedelta(days=7)],
    )
    regions = session.scalar(select(func.count()).select_from(Region)) or 0
    obligations = session.scalar(select(func.count()).select_from(Obligation)) or 0
    alerts = session.scalar(select(func.count()).select_from(Notification)) or 0

    return PublicSummary(
        applications_tracked=applications,
        active=active,
        past_deadline=past_deadline,
        due_in_7_days=due_next_7,
        regions=regions,
        obligations_monitored=obligations,
        alerts_raised=alerts,
        applications_by_week=[
            WeeklyPoint(**point) for point in service.week_series(session, weeks=8)
        ],
        as_of=now.isoformat(),
    )
