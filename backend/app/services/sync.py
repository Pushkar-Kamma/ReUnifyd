"""Background sync helpers.

Pulls daily metrics from the YouTube Analytics API and upserts them into the
local DB. Designed to be callable both from FastAPI endpoints (with a Request)
and from the scheduler (without one).
"""
from __future__ import annotations

import datetime as dt
import logging

import httpx
import sqlalchemy as sa
from sqlmodel import Session, select

from ..db.core import engine
from ..db.models import Channel, ChannelDailyMetrics, UserChannel
from .token_helper import get_valid_access_token_for_channel_bg

log = logging.getLogger(__name__)

ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports"
ANALYTICS_METRICS = ",".join(
    [
        "views",
        "estimatedMinutesWatched",
        "subscribersGained",
        "subscribersLost",
        "estimatedRevenue",
    ]
)
RECENT_SYNC_WINDOW_SECS = 8 * 3600


async def sync_channel_daily(session: Session, channel_id: int, days: int = 30) -> dict:
    """Sync daily metrics for one channel. Returns a small status dict.

    Mirrors the existing `/youtube/sync/daily` endpoint logic but is reusable
    from background contexts.
    """
    ch = session.get(Channel, channel_id)
    if not ch:
        return {"ok": False, "skipped": True, "reason": "channel_not_found", "channel_id": channel_id}
    if not ch.is_active:
        return {"ok": False, "skipped": True, "reason": "inactive", "channel_id": channel_id}

    # 8-hour cool-down to avoid hammering the API on retries
    if ch.last_synced_at and (dt.datetime.now(dt.UTC) - ch.last_synced_at).total_seconds() < RECENT_SYNC_WINDOW_SECS:
        return {"ok": True, "skipped": True, "reason": "recently_synced", "channel_id": channel_id}

    try:
        token = await get_valid_access_token_for_channel_bg(session, channel_id)
    except RuntimeError as e:
        return {"ok": False, "skipped": True, "reason": "auth", "detail": str(e), "channel_id": channel_id}

    end = dt.date.today()
    start = end - dt.timedelta(days=max(1, days) - 1)

    params = {
        "ids": f"channel=={ch.external_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": ANALYTICS_METRICS,
        "dimensions": "day",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            ANALYTICS_URL,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code == 401:
            # One retry with a fresh token in case of an in-flight expiry
            try:
                token = await get_valid_access_token_for_channel_bg(session, channel_id)
            except RuntimeError as e:
                return {"ok": False, "reason": "auth_retry", "detail": str(e), "channel_id": channel_id}
            r = await client.get(
                ANALYTICS_URL,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )

    if r.status_code >= 400:
        return {"ok": False, "reason": "api", "status": r.status_code, "detail": r.text[:500], "channel_id": channel_id}

    data = r.json()
    headers = [h["name"] for h in data.get("columnHeaders", [])]
    idx = {name: i for i, name in enumerate(headers)}
    rows = data.get("rows", []) or []

    def _get(row, name, default=None):
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else default

    inserted = 0
    for row in rows:
        try:
            day = dt.date.fromisoformat(_get(row, "day"))
        except (TypeError, ValueError):
            continue
        views = int(_get(row, "views", 0) or 0)
        wtm = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)
        impr = int(_get(row, "impressions", 0) or 0)
        ctr01 = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)
        sg = int(_get(row, "subscribersGained", 0) or 0)
        sl = int(_get(row, "subscribersLost", 0) or 0)
        rev = float(_get(row, "estimatedRevenue", 0) or 0.0)

        session.exec(
            sa.text(
                "DELETE FROM channel_daily_metrics WHERE channel_id = :cid AND date = :d"
            ),
            {"cid": ch.id, "d": day},
        )
        session.add(
            ChannelDailyMetrics(
                channel_id=ch.id,
                date=day,
                subscribers_gained=sg,
                subscribers_lost=sl,
                views=views,
                watch_time_minutes=int(round(wtm)),
                impressions=impr,
                click_through_rate=ctr01 * 100.0,
                estimated_revenue=rev,
            )
        )
        inserted += 1

    ch.last_synced_at = dt.datetime.now(dt.UTC)
    session.add(ch)
    session.commit()
    return {"ok": True, "inserted_rows": inserted, "channel_id": ch.id}


async def sync_all_active_channels() -> dict:
    """Iterate every active linked channel and run a daily sync.

    Designed to be called by the scheduler. Opens its own DB session.
    """
    started = dt.datetime.now(dt.UTC)
    results: list[dict] = []
    with Session(engine) as session:
        ids = session.exec(
            select(Channel.id)
            .join(UserChannel, UserChannel.channel_id == Channel.id)
            .where(Channel.is_active == True)  # noqa: E712
            .distinct()
        ).all()

    for cid in ids:
        try:
            with Session(engine) as session:
                res = await sync_channel_daily(session, cid)
        except Exception as e:
            log.exception("scheduled sync failed for channel %s", cid)
            res = {"ok": False, "reason": "exception", "detail": str(e), "channel_id": cid}
        results.append(res)

    finished = dt.datetime.now(dt.UTC)
    summary = {
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_secs": (finished - started).total_seconds(),
        "channels": len(results),
        "ok": sum(1 for r in results if r.get("ok")),
        "skipped": sum(1 for r in results if r.get("skipped")),
        "failed": sum(1 for r in results if not r.get("ok") and not r.get("skipped")),
        "results": results,
    }
    log.info("sync_all_active_channels: %s", {k: v for k, v in summary.items() if k != "results"})
    return summary
