# backend/app/api/youtube.py
from __future__ import annotations

import datetime as dt
import httpx
import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.api.deps import require_user_id
from ..db.core import get_session
from ..db.models import GoogleAccount, Channel, MetricDaily
from ..services.token_helper import (
    get_valid_access_token,
    refresh_and_persist_access_token,
    get_valid_access_token_for_channel,
)

router = APIRouter()


# ----------------------------
# Existing endpoint (user's own channels via "mine=true")
# ----------------------------
@router.get("/channels/me")
async def channels_me(
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    Returns the authenticated user's channel info.

    Flow:
      1) Get/refresh a usable access token (using the refresh token if needed).
      2) Call YouTube channels.list?mine=true.
      3) If Google replies 401, refresh once and retry.
    """
    # 1) Ensure the user has a linked GoogleAccount row
    ga = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    if not ga:
        raise HTTPException(status_code=400, detail="no connected Google account")

    # 2) Obtain a valid access token (helper may refresh or bootstrap)
    try:
        access_token = await get_valid_access_token(request, session, user_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Helper to call YouTube once with a given token
    async def call_youtube(token: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=20.0) as client:
            return await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "snippet,contentDetails,statistics", "mine": "true"},
                headers={"Authorization": f"Bearer {token}"},
            )

    # 3) First attempt
    resp = await call_youtube(access_token)

    # 4) If stale ⇒ 401, refresh once and retry
    if resp.status_code == 401:
        try:
            new_access = await refresh_and_persist_access_token(request, session, ga)
        except RuntimeError as e:
            raise HTTPException(status_code=401, detail=str(e))
        resp = await call_youtube(new_access)

    if resp.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="unauthorized from YouTube API (token likely revoked or missing scopes)",
        )

    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

    data = resp.json()
    return {
        "ok": True,
        "user_id": user_id,
        "google_account_id": getattr(ga, "id", None),
        "channels": data,
    }


# ----------------------------
# NEW: list all channels stored for this user (multi-account safe)
# ----------------------------
@router.get("/channels")
def list_channels(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    chans = session.exec(
        select(Channel).where(Channel.user_id == user_id, Channel.active == True)
    ).all()
    return {
        "ok": True,
        "channels": [
            {
                "id": c.id,
                "yt_channel_id": c.yt_channel_id,
                "title": c.title,
                "thumbnail_url": c.thumbnail_url,
                "last_synced_at": c.last_synced_at,
            }
            for c in chans
        ],
    }


# ----------------------------
# NEW: incremental daily sync for a specific channel
# ----------------------------
@router.post("/sync/daily")
async def sync_daily(
    channel_id: int,
    days: int = 30,
    request: Request = ...,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    Incremental sync of daily metrics for a channel.
    Enforces an "8-hour" guard via last_synced_at on the Channel.
    """
    # Ensure the channel belongs to this user
    c = session.get(Channel, channel_id)
    if not c or c.user_id != user_id:
        raise HTTPException(status_code=404, detail="channel not found")

    # 8-hour guard
    if c.last_synced_at and (dt.datetime.utcnow() - c.last_synced_at).total_seconds() < 8 * 3600:
        return {"ok": True, "skipped": True, "reason": "recently synced"}

    # get valid token for THIS channel (picks the right GoogleAccount)
    try:
        token = await get_valid_access_token_for_channel(request, session, channel_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # decide date range (incremental)
    end = dt.date.today()
    start = end - dt.timedelta(days=max(1, days) - 1)

    # YouTube Analytics API call for daily, channel-level
    params = {
        "ids": f"channel=={c.yt_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": ",".join(
            [
                "views",
                "watchTimeHours",
                "averageViewDuration",
                "impressions",
                "impressionsCtr",
                "likes",
                "subscribersGained",
                "subscribersLost",
                "estimatedRevenue",
            ]
        ),
        "dimensions": "day",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            "https://youtubeanalytics.googleapis.com/v2/reports",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

    if r.status_code == 401:
        # token likely stale for this GA; refresh against the GA tied to this channel then retry
        ga = session.get(GoogleAccount, c.google_account_id)
        if not ga:
            raise HTTPException(status_code=404, detail="google account not found for channel")
        try:
            token = await refresh_and_persist_access_token(request, session, ga)
        except RuntimeError as e:
            raise HTTPException(status_code=401, detail=str(e))

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                "https://youtubeanalytics.googleapis.com/v2/reports",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )

    try:
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

    data = r.json()

    # Persist rows
    headers = [h["name"] for h in data.get("columnHeaders", [])]
    rows = data.get("rows", []) or []

    idx = {name: i for i, name in enumerate(headers)}

    def _get(row, name, default=None):
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else default

    for row in rows:
        day = dt.date.fromisoformat(_get(row, "day"))
        views = int(_get(row, "views", 0) or 0)
        wth = float(_get(row, "watchTimeHours", 0) or 0.0)
        avgd = float(_get(row, "averageViewDuration", 0) or 0.0)  # seconds
        impr = int(_get(row, "impressions", 0) or 0)
        ctr = float(_get(row, "impressionsCtr", 0) or 0.0)  # 0..1
        likes = int(_get(row, "likes", 0) or 0)
        sg = int(_get(row, "subscribersGained", 0) or 0)
        sl = int(_get(row, "subscribersLost", 0) or 0)
        rev = float(_get(row, "estimatedRevenue", 0) or 0.0)

        # Upsert by delete+insert (dev-simple)
        session.exec(
            sa.text(
                "DELETE FROM metricdaily WHERE channel_id = :cid AND video_id IS NULL AND date = :d"
            ),
            {"cid": c.id, "d": day},
        )

        session.add(
            MetricDaily(
                channel_id=c.id,
                video_id=None,
                date=day,
                views=views,
                watch_time_min=int(round(wth * 60)),  # hours -> minutes
                avg_view_duration_sec=int(round(avgd)),  # seconds
                impressions=impr,
                impressions_ctr_pct=ctr * 100.0,  # 0..1 -> %
                likes=likes,
                subs_gained=sg,
                subs_lost=sl,
                est_revenue_minor=int(round(rev * 100)),  # dollars -> cents
            )
        )

    c.last_synced_at = dt.datetime.utcnow()
    session.add(c)
    session.commit()

    return {"ok": True, "inserted_rows": len(rows), "channel_id": c.id}


# ----------------------------
# Debug: per-user GA status (no secrets)
# ----------------------------
@router.get("/debug/googleaccount")
def debug_googleaccount(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    Simple debug endpoint to see what we have stored for the current user.
    (Does not reveal token strings.)
    """
    ga = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    if not ga:
        raise HTTPException(status_code=404, detail="no google account row")

    return {
        "ok": True,
        "user_id": user_id,
        "google_account_id": getattr(ga, "id", None),
        "has_access_token": bool(getattr(ga, "access_token_enc", None)),
        "has_refresh_token": bool(getattr(ga, "refresh_token", None)),  # property decrypts safely
        "status": getattr(ga, "status", None),
        "created_at": str(getattr(ga, "created_at", None)),
    }
