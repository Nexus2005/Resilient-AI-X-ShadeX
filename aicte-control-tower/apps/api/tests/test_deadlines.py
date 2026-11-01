from datetime import UTC, date, datetime, timedelta

from app.engines.deadlines import add_working_days, elapsed_ratio, sla_state


def test_working_days_skip_weekends_and_holidays() -> None:
    friday = datetime(2026, 10, 30, 9, 0, tzinfo=UTC)
    holidays = {date(2026, 11, 3)}

    # Fri + 4 working days: Mon 2, Wed 4, Thu 5, Fri 6 (Tue 3 is a holiday).
    assert add_working_days(friday, 4, holidays) == datetime(2026, 11, 6, 9, 0, tzinfo=UTC)
    assert add_working_days(friday, 1, holidays) == datetime(2026, 11, 2, 9, 0, tzinfo=UTC)


def test_working_days_never_count_zero() -> None:
    start = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
    assert add_working_days(start, 0, set()) == start


def test_sla_thresholds() -> None:
    entered = datetime(2026, 10, 1, 0, 0, tzinfo=UTC)
    due = entered + timedelta(days=10)

    assert sla_state(entered, due, entered + timedelta(days=7, hours=23)) == "on_track"
    assert sla_state(entered, due, entered + timedelta(days=8)) == "at_risk"
    assert sla_state(entered, due, due) == "overdue"
    assert sla_state(entered, due, due + timedelta(hours=1)) == "overdue"
    assert elapsed_ratio(entered, due, entered + timedelta(days=5)) == 0.5
