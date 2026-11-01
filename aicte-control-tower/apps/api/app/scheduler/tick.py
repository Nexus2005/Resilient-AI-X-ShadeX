import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.clock import now_utc
from app.core.db import SessionLocal
from app.engines.monitor import run_checks

logger = logging.getLogger("aicte.scheduler")
TICK_SECONDS = 30


def tick() -> None:
    """One idempotent scheduler pass across all seven monitoring checks."""
    try:
        with SessionLocal() as session:
            result = run_checks(session)
            session.commit()
        logger.info("tick at %s %s", now_utc().isoformat(), result)
    except Exception:  # keep the scheduler alive; log and retry next tick
        logger.exception("scheduler tick failed")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(tick, IntervalTrigger(seconds=TICK_SECONDS), id="main-tick", max_instances=1)
    logger.info("scheduler started, tick every %ss", TICK_SECONDS)
    tick()
    scheduler.start()


if __name__ == "__main__":
    main()
