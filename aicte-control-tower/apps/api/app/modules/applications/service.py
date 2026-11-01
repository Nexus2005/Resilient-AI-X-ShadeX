"""Role-scoped queries and helpers for applications."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.deps import REGION_ROLES
from app.models import Application, Institution, Region, StageInstance, User

OPEN_STAGE_STATES = ("draft",)

STAGE_LABELS = {
    "draft": "Draft",
    "submitted": "Submitted",
    "scrutiny": "Scrutiny",
    "re_scrutiny": "Re-scrutiny",
    "reverted": "Returned to institution",
    "evc_queue": "EVC queue",
    "evc_scheduled": "EVC scheduled",
    "evc_completed": "EVC completed",
    "sac_shc": "SAC/SHC",
    "approval": "Awaiting approval",
    "approved_with_undertakings": "Approved with undertakings",
    "approved": "Approved",
    "closed": "Closed",
}


def stage_label(stage: str) -> str:
    return STAGE_LABELS.get(stage, stage.replace("_", " ").title())


def scoped_statement(user: User) -> Select:
    statement = (
        select(Application, Institution, Region)
        .join(Institution, Institution.id == Application.institution_id)
        .join(Region, Region.id == Institution.region_id)
    )
    if user.role == "institution":
        statement = statement.where(Application.institution_id == user.institution_id)
    elif user.role in REGION_ROLES:
        statement = statement.where(Institution.region_id == user.region_id)
    return statement


def scope_conditions(user: User) -> list:
    if user.role == "institution":
        return [Application.institution_id == user.institution_id]
    if user.role in REGION_ROLES:
        return [Institution.region_id == user.region_id]
    return []


def open_stage_instances(session: Session, application_ids: list[uuid.UUID]) -> dict:
    if not application_ids:
        return {}
    rows = session.scalars(
        select(StageInstance)
        .where(
            StageInstance.application_id.in_(application_ids),
            StageInstance.completed_at.is_(None),
        )
        .order_by(StageInstance.entered_at.desc())
    ).all()
    by_application: dict[uuid.UUID, StageInstance] = {}
    for row in rows:
        by_application.setdefault(row.application_id, row)
    return by_application


def sla_state(stage: StageInstance | None, now: datetime | None = None) -> str | None:
    if stage is None:
        return None
    now = now or now_utc()
    if now >= stage.due_at:
        return "overdue"
    elapsed = (now - stage.entered_at).total_seconds()
    window = (stage.due_at - stage.entered_at).total_seconds()
    if window <= 0:
        return "overdue"
    return "at_risk" if elapsed / window >= 0.8 else "on_track"


def days_between(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None
    return max(0, (end - start).days)


def build_items(session: Session, rows) -> list[dict]:
    applications = [row[0] for row in rows]
    stages = open_stage_instances(session, [application.id for application in applications])
    owner_ids = {application.owner_user_id for application in applications if application.owner_user_id}
    owners: dict[uuid.UUID, str] = {}
    if owner_ids:
        owners = {
            user.id: user.name
            for user in session.scalars(select(User).where(User.id.in_(owner_ids))).all()
        }

    now = now_utc()
    items = []
    for application, institution, region in rows:
        stage = stages.get(application.id)
        items.append(
            {
                "id": application.id,
                "app_no": application.app_no,
                "institution_id": institution.id,
                "institution_name": institution.name,
                "institution_state": institution.state,
                "region_id": region.id,
                "region_name": region.name,
                "type": application.type,
                "route": application.route,
                "current_stage": application.current_stage,
                "status": application.status,
                "submitted_at": application.submitted_at,
                "owner_name": owners.get(application.owner_user_id) if application.owner_user_id else None,
                "stage_due_at": stage.due_at if stage else None,
                "total_age_days": days_between(application.submitted_at, now),
                "stage_age_days": days_between(stage.entered_at, now) if stage else None,
                "stage_target_days": days_between(stage.entered_at, stage.due_at) if stage else None,
                "sla_state": sla_state(stage, now),
            }
        )
    return items


def filter_conditions(
    user: User,
    stage: str | None,
    status: str | None,
    type_: str | None,
    search: str | None,
    region_id: uuid.UUID | None,
) -> list:
    conditions = []
    if user.role == "institution":
        conditions.append(Application.institution_id == user.institution_id)
    elif user.role in REGION_ROLES:
        conditions.append(Institution.region_id == user.region_id)
    if stage:
        conditions.append(Application.current_stage == stage)
    if status:
        conditions.append(Application.status == status)
    if type_:
        conditions.append(Application.type == type_)
    if region_id is not None:
        conditions.append(Institution.region_id == region_id)
    if search:
        term = f"%{search.lower()}%"
        conditions.append(
            or_(
                func.lower(Institution.name).like(term),
                func.lower(Application.app_no).like(term),
                func.lower(Institution.district).like(term),
            )
        )
    return conditions


def stage_owner_count(session: Session, user: User, now: datetime | None = None) -> int:
    """Open stages whose owner is this user."""
    return (
        session.scalar(
            select(func.count())
            .select_from(StageInstance)
            .join(Application, Application.id == StageInstance.application_id)
            .join(Institution, Institution.id == Application.institution_id)
            .where(
                StageInstance.completed_at.is_(None),
                StageInstance.owner_user_id == user.id,
                *scope_conditions(user),
            )
        )
        or 0
    )


def week_series(session: Session, weeks: int = 8) -> list[dict]:
    now = now_utc()
    start = now - timedelta(weeks=weeks)
    rows = session.execute(
        select(
            func.date_trunc("week", StageInstance.entered_at).label("week"),
            func.count().label("count"),
        )
        .where(StageInstance.entered_at >= start)
        .group_by("week")
        .order_by("week")
    ).all()
    return [
        {"week_start": week.astimezone(UTC).date().isoformat(), "count": count}
        for week, count in rows
    ]
