"""Working-day deadline maths and SLA thresholds."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Holiday

WARNING_THRESHOLD = 0.8


def load_holidays(session: Session) -> set[date]:
    return set(session.scalars(select(Holiday.date)).all())


def add_working_days(start: datetime, days: int, holidays: set[date]) -> datetime:
    """Add working days, skipping weekends and configured holidays."""
    if days <= 0:
        return start
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() >= 5:
            continue
        if current.date() in holidays:
            continue
        added += 1
    return current




def sla_state(entered_at: datetime, due_at: datetime, now: datetime) -> str:
    if now >= due_at:
        return "overdue"
    window = (due_at - entered_at).total_seconds()
    if window <= 0:
        return "overdue"
    elapsed = (now - entered_at).total_seconds()
    return "at_risk" if elapsed / window >= WARNING_THRESHOLD else "on_track"


def elapsed_ratio(entered_at: datetime, due_at: datetime, now: datetime) -> float:
    window = (due_at - entered_at).total_seconds()
    if window <= 0:
        return 1.0
    return (now - entered_at).total_seconds() / window
