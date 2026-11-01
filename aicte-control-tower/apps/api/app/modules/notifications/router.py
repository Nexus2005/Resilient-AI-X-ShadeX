import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.db import get_session
from app.core.deps import get_current_user
from app.models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: uuid.UUID
    channel: str
    template_key: str
    subject: str
    body: str
    status: str
    entity_type: str
    entity_id: uuid.UUID
    created_at: str
    read_at: str | None


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int


def _out(row: Notification) -> NotificationOut:
    return NotificationOut(
        id=row.id,
        channel=row.channel,
        template_key=row.template_key,
        subject=row.subject,
        body=row.body,
        status=row.status,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        created_at=(row.sent_at or row.created_at).isoformat(),
        read_at=row.read_at.isoformat() if row.read_at else None,
    )


@router.get("", response_model=NotificationPage)
def list_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> NotificationPage:
    conditions = [Notification.user_id == user.id]
    if unread_only:
        conditions.append(Notification.read_at.is_(None))

    total = session.scalar(select(func.count()).select_from(Notification).where(*conditions)) or 0
    unread = (
        session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        )
        or 0
    )
    rows = session.scalars(
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return NotificationPage(items=[_out(row) for row in rows], total=total, unread=unread)


@router.post("/{notification_id}/read", status_code=204)
def mark_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    notification = session.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if notification.read_at is None:
        notification.read_at = now_utc()
        session.commit()


@router.post("/read-all", status_code=204)
def mark_all_read(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> None:
    rows = session.scalars(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).all()
    for row in rows:
        row.read_at = now_utc()
    session.commit()
