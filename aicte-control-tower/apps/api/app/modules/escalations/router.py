import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.db import get_session
from app.core.deps import REGION_ROLES, get_current_user
from app.engines.audit import append_audit
from app.engines.notify import notify
from app.models import Application, Escalation, Institution, Region, User

router = APIRouter(prefix="/escalations", tags=["escalations"])


class EscalationOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    level: int
    triggered_at: str
    acknowledged_at: str | None
    resolved_at: str | None
    to_user_name: str | None
    label: str
    region_name: str | None


def _describe(session: Session, escalation: Escalation) -> tuple[str, str | None]:
    label = escalation.entity_type.replace("_", " ")
    region_name = None
    if escalation.entity_type == "application":
        application = session.get(Application, escalation.entity_id)
        if application is not None:
            label = application.app_no
            institution = session.get(Institution, application.institution_id)
            if institution is not None:
                region = session.get(Region, institution.region_id)
                region_name = region.name if region else None
    return label, region_name


@router.get("", response_model=list[EscalationOut])
def list_escalations(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[EscalationOut]:
    if user.role == "institution":
        raise HTTPException(status_code=403, detail="Escalations are visible to officials.")

    query = select(Escalation)
    if user.role in REGION_ROLES:
        query = query.where(Escalation.to_user_id == user.id)

    rows = session.scalars(query.order_by(Escalation.triggered_at.desc()).limit(100)).all()
    items: list[EscalationOut] = []
    for row in rows:
        recipient = session.get(User, row.to_user_id) if row.to_user_id else None
        label, region_name = _describe(session, row)
        items.append(
            EscalationOut(
                id=row.id,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                level=row.level,
                triggered_at=row.triggered_at.isoformat(),
                acknowledged_at=row.acknowledged_at.isoformat() if row.acknowledged_at else None,
                resolved_at=row.resolved_at.isoformat() if row.resolved_at else None,
                to_user_name=recipient.name if recipient else None,
                label=label,
                region_name=region_name,
            )
        )
    return items


@router.post("/{escalation_id}/acknowledge", response_model=EscalationOut)
def acknowledge(
    escalation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> EscalationOut:
    escalation = session.get(Escalation, escalation_id)
    if escalation is None:
        raise HTTPException(status_code=404, detail="Escalation not found.")
    if user.role in REGION_ROLES and escalation.to_user_id != user.id:
        raise HTTPException(status_code=404, detail="Escalation not found.")
    if user.role not in (*REGION_ROLES, "bureau_officer", "admin"):
        raise HTTPException(status_code=403, detail="You cannot acknowledge escalations.")
    if escalation.acknowledged_at is not None:
        raise HTTPException(status_code=400, detail="This escalation is already acknowledged.")

    escalation.acknowledged_at = now_utc()
    append_audit(
        session,
        actor=user,
        action="escalation.acknowledged",
        entity_type=escalation.entity_type,
        entity_id=escalation.entity_id,
        payload={"escalation_id": str(escalation.id), "level": escalation.level},
    )
    session.commit()

    if escalation.to_user_id:
        recipient = session.get(User, escalation.to_user_id)
        if recipient is not None:
            notify(
                session,
                user=recipient,
                template_key="escalation_acknowledged",
                context={
                    "level": escalation.level,
                    "entity": escalation.entity_type.replace("_", " "),
                    "actor": user.name,
                },
                entity_type="escalation",
                entity_id=escalation.id,
                trigger_key=f"acknowledged:{escalation.id}",
                trigger="escalation",
            )
            session.commit()

    label, region_name = _describe(session, escalation)
    return EscalationOut(
        id=escalation.id,
        entity_type=escalation.entity_type,
        entity_id=escalation.entity_id,
        level=escalation.level,
        triggered_at=escalation.triggered_at.isoformat(),
        acknowledged_at=escalation.acknowledged_at.isoformat(),
        resolved_at=None,
        to_user_name=user.name,
        label=label,
        region_name=region_name,
    )
