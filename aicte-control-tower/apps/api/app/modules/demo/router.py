from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.core.db import get_session
from app.core.deps import get_current_user
from app.engines.audit import append_audit
from app.engines.monitor import run_checks
from app.models import Escalation, Notification, SystemClock, User

router = APIRouter(prefix="/demo", tags=["demo"])


class ClockOut(BaseModel):
    offset_seconds: int
    now: str
    demo_mode: bool
    checks: dict[str, int] | None = None


class AdvanceRequest(BaseModel):
    days: int = Field(ge=1, le=365)


class TickResult(BaseModel):
    checks: dict[str, int]
    now: str


def _clock(session: Session) -> SystemClock:
    clock = session.get(SystemClock, 1)
    if clock is None:
        clock = SystemClock(id=1, offset_seconds=0)
        session.add(clock)
        session.commit()
    return clock


def _out(clock: SystemClock) -> ClockOut:
    return ClockOut(
        offset_seconds=clock.offset_seconds,
        now=now_utc().isoformat(),
        demo_mode=settings.demo_mode,
    )


@router.get("/clock", response_model=ClockOut)
def get_clock(
    _: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> ClockOut:
    return _out(_clock(session))


@router.post("/clock/advance", response_model=ClockOut)
def advance_clock(
    payload: AdvanceRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ClockOut:
    if not settings.demo_mode:
        raise HTTPException(status_code=404, detail="The demo clock is off.")
    clock = _clock(session)
    clock.offset_seconds += payload.days * 24 * 60 * 60
    append_audit(
        session,
        actor=user,
        action="demo.clock_advanced",
        entity_type="system_clock",
        entity_id=None,
        payload={"days": payload.days, "offset_seconds": clock.offset_seconds},
    )
    session.commit()
    checks = run_checks(session)
    session.commit()
    result = _out(clock)
    result.checks = checks
    return result


@router.post("/clock/reset", response_model=ClockOut)
def reset_clock(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> ClockOut:
    if not settings.demo_mode:
        raise HTTPException(status_code=404, detail="The demo clock is off.")
    clock = _clock(session)
    clock.offset_seconds = 0
    # Alerts raised by the jump describe a future that no longer exists. Return the
    # demonstration to its seeded baseline; workflow records stay untouched.
    session.execute(
        delete(Notification).where(Notification.trigger.in_(("scheduler", "escalation")))
    )
    session.execute(delete(Escalation))
    append_audit(
        session,
        actor=user,
        action="demo.clock_reset",
        entity_type="system_clock",
        entity_id=None,
        payload={},
    )
    session.commit()
    return _out(clock)


@router.post("/tick", response_model=TickResult)
def run_tick_now(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> TickResult:
    result = run_checks(session)
    append_audit(
        session,
        actor=user,
        action="scheduler.tick_requested",
        entity_type="system_clock",
        entity_id=None,
        payload=result,
    )
    session.commit()
    return TickResult(checks=result, now=now_utc().isoformat())
