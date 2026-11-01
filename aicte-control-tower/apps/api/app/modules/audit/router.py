import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import REGION_ROLES, get_current_user
from app.engines.audit import verify_chain
from app.models import Application, AuditEvent, Institution, User

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditItem(BaseModel):
    id: int
    at: str
    action: str
    actor_name: str | None
    role: str | None
    entity_type: str
    entity_id: str | None
    payload: dict
    hash: str
    prev_hash: str


class AuditPage(BaseModel):
    items: list[AuditItem]
    total: int
    page: int
    page_size: int


class ChainStatus(BaseModel):
    valid: bool
    checked: int
    broken_id: int | None


def _require_official(user: User) -> None:
    if user.role == "institution":
        raise HTTPException(status_code=403, detail="The audit trail is visible to officials.")


def _region_application_ids(session: Session, user: User) -> list[uuid.UUID]:
    return list(
        session.scalars(
            select(Application.id)
            .join(Institution, Institution.id == Application.institution_id)
            .where(Institution.region_id == user.region_id)
        ).all()
    )


@router.get("", response_model=AuditPage)
def list_events(
    entity_type: str | None = None,
    action: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AuditPage:
    _require_official(user)

    conditions = []
    if user.role in REGION_ROLES:
        conditions.append(
            AuditEvent.entity_id.in_(_region_application_ids(session, user)),
        )
        conditions.append(AuditEvent.entity_type == "application")
    if entity_type:
        conditions.append(AuditEvent.entity_type == entity_type)
    if action:
        conditions.append(AuditEvent.action.ilike(f"%{action}%"))

    total = (
        session.scalar(select(func.count()).select_from(AuditEvent).where(*conditions)) or 0
    )
    rows = session.execute(
        select(AuditEvent, User.name)
        .outerjoin(User, User.id == AuditEvent.actor_id)
        .where(*conditions)
        .order_by(AuditEvent.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return AuditPage(
        items=[
            AuditItem(
                id=event.id,
                at=event.at.isoformat(),
                action=event.action,
                actor_name=actor_name,
                role=event.role,
                entity_type=event.entity_type,
                entity_id=str(event.entity_id) if event.entity_id else None,
                payload=event.payload or {},
                hash=event.hash,
                prev_hash=event.prev_hash,
            )
            for event, actor_name in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/verify", response_model=ChainStatus)
def verify(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> ChainStatus:
    _require_official(user)
    result = verify_chain(session)
    return ChainStatus(
        valid=bool(result["valid"]),
        checked=int(result["checked"]),
        broken_id=result["broken_id"],
    )
