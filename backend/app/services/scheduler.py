"""APScheduler setup.

In-process scheduler that runs alongside FastAPI. For our scale this is enough;
later we can graduate to Celery/RQ or a separate Render Cron Job.

Note: On Render's free tier the service spins down after 15 min idle, which can
delay jobs scheduled at exact times. The job will run on the next wake-up
instead. For Phase 1 this is acceptable.

Configure the sync time via environment variables:
  SYNC_HOUR     - hour to run (0-23, default 1)
  SYNC_MINUTE   - minute to run (0-59, default 0)
  SYNC_TIMEZONE - IANA timezone name (default America/New_York)
"""
from __future__ import annotations

import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .sync import sync_all_active_channels

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler | None:
    return _scheduler


def start_scheduler() -> AsyncIOScheduler | None:
    """Start the singleton scheduler. Safe to call multiple times."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    # Allow disabling via env (useful in tests / one-off CLI runs)
    if os.environ.get("DISABLE_SCHEDULER", "").lower() in {"1", "true", "yes"}:
        log.info("scheduler disabled via DISABLE_SCHEDULER")
        return None

    sync_hour = int(os.environ.get("SYNC_HOUR", "1"))
    sync_minute = int(os.environ.get("SYNC_MINUTE", "0"))
    sync_tz = os.environ.get("SYNC_TIMEZONE", "America/New_York")

    sched = AsyncIOScheduler(timezone="UTC")

    sched.add_job(
        sync_all_active_channels,
        trigger=CronTrigger(hour=sync_hour, minute=sync_minute, timezone=sync_tz),
        id="sync_all_active_channels_daily",
        name="Daily YouTube metrics sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=60 * 60,  # 1h grace if we missed the slot
    )

    sched.start()
    _scheduler = sched
    log.info(
        "scheduler started; daily sync at %02d:%02d %s; jobs: %s",
        sync_hour, sync_minute, sync_tz,
        [j.id for j in sched.get_jobs()],
    )
    return sched


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        log.info("scheduler stopped")
