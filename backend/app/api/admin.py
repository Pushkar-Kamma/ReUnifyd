"""Admin endpoints.

All endpoints under this router require the request to include
`X-Admin-Token: <ADMIN_TOKEN env var>`. If `ADMIN_TOKEN` is unset, the
endpoints are disabled (404). Use these for manual triggering of background
tasks and as a fallback "cron URL" for external ping services.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException

from ..services.scheduler import get_scheduler
from ..services.sync import sync_all_active_channels

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(x_admin_token: str | None) -> None:
    expected = os.environ.get("ADMIN_TOKEN")
    if not expected:
        # Endpoint effectively disabled when the env var is not set.
        raise HTTPException(status_code=404, detail="not found")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="invalid admin token")


@router.get("/jobs")
def list_jobs(x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    sched = get_scheduler()
    if not sched:
        return {"running": False, "jobs": []}
    return {
        "running": True,
        "jobs": [
            {
                "id": j.id,
                "name": j.name,
                "next_run_time": j.next_run_time.isoformat() if j.next_run_time else None,
                "trigger": str(j.trigger),
            }
            for j in sched.get_jobs()
        ],
    }


@router.post("/sync-all")
async def trigger_sync_all(x_admin_token: str | None = Header(default=None)):
    """Manually run the daily sync for every active channel.

    Safe to call from external schedulers as a fallback.
    """
    _require_admin(x_admin_token)
    summary = await sync_all_active_channels()
    # Strip per-channel details for the response (still in logs)
    summary.pop("results", None)
    return summary
