from datetime import UTC, datetime, timedelta


def _offset_seconds() -> int:
    """Demo clock offset stored in `system_clock`, read without importing models."""
    try:
        from sqlalchemy import text

        from app.core.db import engine

        with engine.connect() as connection:
            value = connection.execute(
                text("SELECT offset_seconds FROM system_clock WHERE id = 1")
            ).scalar()
        return int(value or 0)
    except Exception:
        return 0


def now_utc() -> datetime:
    """Current UTC time including the demo clock offset."""
    return datetime.now(UTC) + timedelta(seconds=_offset_seconds())
