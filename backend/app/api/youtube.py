# backend/app/api/youtube.py
from __future__ import annotations

import datetime as dt
import re

import httpx
import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.api.deps import require_user_id

from ..db.core import get_session
from ..db.models import (
    Channel,
    ChannelDailyMetrics,
    ChannelHourlyMetrics,
    OAuthCredential,
    Platform,
    PlatformAccount,
    UserChannel,
    Video,
    VideoDailyMetrics,
    VideoHourlyMetrics,
)
from ..services.token_helper import (
    get_valid_access_token,
    get_valid_access_token_for_channel,
)

router = APIRouter()

# ----------------------------
# helpers
# ----------------------------

def _user_channel(session: Session, user_id: int, channel_id: int) -> Channel | None:
    """Return the Channel if the user is linked to it, else None."""
    return session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.id == channel_id, Channel.is_active == True)
    ).first()


def _user_video(session: Session, user_id: int, video_id: int) -> tuple[Video, Channel] | None:
    """Return (video, channel) if the user is linked to the video's channel."""
    row = session.exec(
        select(Video, Channel)
        .join(Channel, Channel.id == Video.channel_id)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Video.id == video_id, Video.is_active == True)
    ).first()
    if not row:
        return None
    return row[0], row[1]

async def _yt_analytics_get(request, token: str, params: dict):
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.get(
            "https://youtubeanalytics.googleapis.com/v2/reports",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?"
    r"(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)


def _iso_duration_to_seconds(value: str | None) -> int | None:
    if not value:
        return None
    match = _DURATION_RE.match(value)
    if not match:
        return None
    days = int(match.group('days') or 0)
    hours = int(match.group('hours') or 0)
    minutes = int(match.group('minutes') or 0)
    seconds = int(match.group('seconds') or 0)
    total = days * 86400 + hours * 3600 + minutes * 60 + seconds
    return total if total >= 0 else None


# ----------------------------
# Me: YouTube account channels via "mine=true"
# ----------------------------
@router.get("/channels/me")
async def channels_me(
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    Calls YouTube Data API channels.list?mine=true for the current user's linked YouTube account.
    """
    yt = session.exec(select(Platform).where(Platform.name == "youtube")).first()
    if not yt:
        raise HTTPException(status_code=400, detail="youtube platform not configured")

    pa = session.exec(
        select(PlatformAccount).where(
            PlatformAccount.platform_id == yt.id,
            PlatformAccount.owner_user_id == user_id,
        )
    ).first()
    if not pa:
        raise HTTPException(status_code=400, detail="no connected YouTube account")

    try:
        access_token = await get_valid_access_token(request, session, user_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "snippet,contentDetails,statistics", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code == 401:
        try:
            access_token = await get_valid_access_token(request, session, user_id)
        except RuntimeError as e:
            raise HTTPException(status_code=401, detail=str(e))
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "snippet,contentDetails,statistics", "mine": "true"},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

    data = resp.json()
    return {
        "ok": True,
        # new schema
        "platform_account_id": pa.id,
        # legacy compatibility (old code expected this key)
        "google_account_id": None,
        "channels": data,
    }

# ----------------------------
# List stored channels for user
# ----------------------------
@router.get("/channels")
def list_channels(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    chans = session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.is_active == True)
    ).all()
    total = len(chans)

    return {
        "ok": True,
        # legacy placeholders to avoid breaking old UI code
        "quota": None,
        "remaining": None,
        "total": total,
        "channels": [
            {
                "id": c.id,
                "external_channel_id": c.external_channel_id,
                "title": c.title,
                "avatar_url": c.avatar_url,
                "thumbnail_url": c.avatar_url,
                "banner_url": c.banner_url,
                "custom_url": c.custom_url,
                "description": c.description,
                "country": c.country,
                "language": c.language,
                "subscriber_count": c.subscriber_count,
                "platform_account_id": c.platform_account_id,
                "is_active": c.is_active,
                "published_at": c.published_at,
                "last_synced_at": c.last_synced_at,
            }
            for c in chans
        ],
    }


@router.get("/channels/{channel_id}")
def get_channel(
    channel_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")
    return {
        "ok": True,
        "channel": {
            "id": c.id,
            "external_channel_id": c.external_channel_id,
            "title": c.title,
            "avatar_url": c.avatar_url,
            "banner_url": c.banner_url,
            "custom_url": c.custom_url,
            "description": c.description,
            "country": c.country,
            "language": c.language,
            "subscriber_count": c.subscriber_count,
            "is_active": c.is_active,
            "published_at": c.published_at,
            "last_synced_at": c.last_synced_at,
        },
    }

# ----------------------------
# Audience insights (live; not stored)
# ----------------------------
@router.get("/channel/{channel_id}/insights")
async def channel_insights(
    channel_id: int,
    days: int = 28,
    request: Request = ...,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Pull aggregate audience insights for the given channel + window:
    top countries, device-type split, and traffic-source split.

    These are returned live (no caching layer yet) because the payload is tiny.
    """
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")

    try:
        token = await get_valid_access_token_for_channel(request, session, channel_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=max(1, days) - 1)
    common = {
        "ids": f"channel=={c.external_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": "views",
    }

    async def fetch(extra: dict) -> list[dict]:
        params = {**common, **extra}
        resp = await _yt_analytics_get(request, token, params)
        if resp.status_code == 401:
            new_token = await get_valid_access_token_for_channel(request, session, channel_id)
            resp = await _yt_analytics_get(request, new_token, params)
        if resp.status_code >= 400:
            return []
        data = resp.json()
        headers = [h["name"] for h in data.get("columnHeaders", [])]
        rows = data.get("rows", []) or []
        return [dict(zip(headers, row, strict=False)) for row in rows]

    async def safe_fetch(extra: dict) -> list[dict]:
        try:
            return await fetch(extra)
        except Exception:
            return []

    geography = await safe_fetch({
        "dimensions": "country",
        "sort": "-views",
        "maxResults": 10,
    })
    devices = await safe_fetch({"dimensions": "deviceType"})
    traffic = await safe_fetch({"dimensions": "insightTrafficSourceType"})

    return {
        "ok": True,
        "days": days,
        "geography": [
            {"country": r.get("country"), "views": int(r.get("views") or 0)}
            for r in geography
        ],
        "devices": [
            {"device": r.get("deviceType"), "views": int(r.get("views") or 0)}
            for r in devices
        ],
        "traffic_sources": [
            {"source": r.get("insightTrafficSourceType"), "views": int(r.get("views") or 0)}
            for r in traffic
        ],
    }

# ----------------------------
# Sync all channels for the current user (background task)
# ----------------------------
@router.post("/sync/all")
async def sync_all_channels(
    days: int = 30,
    background_tasks: BackgroundTasks = ...,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Trigger an incremental daily sync for every channel owned by the user.

    Runs in the background so the HTTP response returns immediately.
    Returns the list of channel IDs that were queued.
    """
    from sqlmodel import Session as _Session

    from ..db.core import engine as _engine
    from ..services.sync import sync_channel_daily

    chans = session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.is_active == True)  # noqa: E712
    ).all()

    if not chans:
        return {"ok": True, "queued": [], "message": "No channels found"}

    chan_ids = [c.id for c in chans]

    async def _run_sync(channel_ids: list[int]) -> None:
        import logging as _logging
        log = _logging.getLogger(__name__)
        for cid in channel_ids:
            try:
                with _Session(_engine) as bg_session:
                    result = await sync_channel_daily(bg_session, cid, days=days)
                    log.info("manual sync-all channel %s: %s", cid, result)
            except Exception:
                log.exception("manual sync-all failed for channel %s", cid)

    background_tasks.add_task(_run_sync, chan_ids)
    return {"ok": True, "queued": chan_ids, "message": f"Syncing {len(chan_ids)} channel(s) in background"}


# ----------------------------
# Incremental daily sync for a specific channel
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
    """
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")

    try:
        token = await get_valid_access_token_for_channel(request, session, channel_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=max(1, days) - 1)

    params = {
        "ids": f"channel=={c.external_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": ",".join([
            "views",
            "estimatedMinutesWatched",
            "subscribersGained",
            "subscribersLost",
            "estimatedRevenue",
        ]),
        "dimensions": "day",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            "https://youtubeanalytics.googleapis.com/v2/reports",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

    if r.status_code == 401:
        try:
            token = await get_valid_access_token_for_channel(request, session, channel_id)
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
    headers = [h["name"] for h in data.get("columnHeaders", [])]
    rows = data.get("rows", []) or []
    idx = {name: i for i, name in enumerate(headers)}

    def _get(row, name, default=None):
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else default

    inserted = 0
    for row in rows:
        day = dt.date.fromisoformat(_get(row, "day"))
        views = int(_get(row, "views", 0) or 0)
        wtm = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)
        impr = int(_get(row, "impressions", 0) or 0)
        ctr0_1 = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)
        sg = int(_get(row, "subscribersGained", 0) or 0)
        sl = int(_get(row, "subscribersLost", 0) or 0)
        rev = float(_get(row, "estimatedRevenue", 0) or 0.0)

        session.execute(
            sa.text(
                "DELETE FROM channel_daily_metrics WHERE channel_id = :cid AND date = :d"
            ),
            {"cid": c.id, "d": day},
        )
        session.add(
            ChannelDailyMetrics(
                channel_id=c.id,
                date=day,
                subscribers_total=None,
                subscribers_gained=sg,
                subscribers_lost=sl,
                views=views,
                watch_time_minutes=int(round(wtm)),
                impressions=impr,
                click_through_rate=ctr0_1 * 100.0,
                estimated_revenue=rev,
                revenue_currency=None,
            )
        )
        inserted += 1

    c.last_synced_at = dt.datetime.now(dt.UTC)
    session.add(c)
    session.commit()

    return {"ok": True, "inserted_rows": inserted, "channel_id": c.id}

# ----------------------------
# List videos known for a channel (Video)
# ----------------------------
@router.get("/videos")
def list_videos(
    channel_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")
    vids = session.exec(select(Video).where(Video.channel_id == c.id, Video.is_active == True)).all()
    return {
        "ok": True,
        "videos": [
            {
                "id": v.id,
                "external_video_id": v.external_video_id,
                "title": v.title,
                "thumbnail_url": v.thumbnail_url,
                "published_at": v.published_at,
                "privacy_status": v.privacy_status,
                "content_type": v.content_type,
            }
            for v in vids
        ],
    }

# ----------------------------
# Initial full sync (videos + per-video daily metrics)
# ----------------------------
@router.post("/sync/full")
async def sync_full(
    channel_id: int,
    days: int = 180,
    request: Request = ...,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")

    try:
        token = await get_valid_access_token_for_channel(request, session, channel_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    now = dt.datetime.now(dt.UTC)
    end_date = dt.datetime.now(dt.UTC).date()
    start_date = end_date - dt.timedelta(days=max(1, days) - 1)
    hourly_window_days = max(1, min(days, 7))
    hourly_start_date = end_date - dt.timedelta(days=hourly_window_days - 1)

    async def data_api_get(url: str, params: dict) -> dict:
        nonlocal token
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 401:
            token = await get_valid_access_token_for_channel(request, session, channel_id)
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    url,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
        resp.raise_for_status()
        return resp.json()

    async def analytics_get_json(params: dict) -> dict:
        nonlocal token
        resp = await _yt_analytics_get(request, token, params)
        if resp.status_code == 401:
            token = await get_valid_access_token_for_channel(request, session, channel_id)
            resp = await _yt_analytics_get(request, token, params)
        resp.raise_for_status()
        return resp.json()

    channel_data = await data_api_get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
            "part": "snippet,contentDetails,statistics",
            "id": c.external_channel_id,
        },
    )
    channel_items = channel_data.get("items") or []
    if not channel_items:
        raise HTTPException(status_code=400, detail="unable to locate uploads playlist for channel")
    channel_info = channel_items[0]
    uploads = (
        channel_info.get("contentDetails", {})
        .get("relatedPlaylists", {})
        .get("uploads")
    )
    if not uploads:
        raise HTTPException(status_code=400, detail="channel has no uploads playlist")

    current_subscribers: int | None = None
    stats = channel_info.get("statistics") or {}
    if stats.get("subscriberCount") is not None:
        try:
            current_subscribers = int(stats.get("subscriberCount"))
            c.subscriber_count = current_subscribers
        except (TypeError, ValueError):
            current_subscribers = None
    snippet = channel_info.get("snippet") or {}
    if snippet.get("description"):
        c.description = snippet.get("description")
    if snippet.get("customUrl"):
        c.custom_url = snippet.get("customUrl")
    if snippet.get("title"):
        c.title = snippet.get("title")
    if snippet.get("country"):
        c.country = snippet.get("country")
    session.add(c)
    session.flush()

    async def sync_channel_metrics() -> None:
        metrics = [
            "views",
            "estimatedMinutesWatched",
            "subscribersGained",
            "subscribersLost",
            "estimatedRevenue",
        ]
        try:
            daily = await analytics_get_json(
                {
                    "ids": f"channel=={c.external_channel_id}",
                    "startDate": start_date.isoformat(),
                    "endDate": end_date.isoformat(),
                    "metrics": ",".join(metrics),
                    "dimensions": "day",
                }
            )
        except httpx.HTTPStatusError:
            daily = None
        if daily:
            headers = [h["name"] for h in daily.get("columnHeaders", [])]
            rows = daily.get("rows", []) or []
            idx = {name: i for i, name in enumerate(headers)}

            def _get(row, name, default=None):
                i = idx.get(name)
                return row[i] if i is not None and i < len(row) else default

            for row in rows:
                day = dt.date.fromisoformat(_get(row, "day"))
                session.execute(
                    sa.text(
                        "DELETE FROM channel_daily_metrics WHERE channel_id = :cid AND date = :d"
                    ),
                    {"cid": c.id, "d": day},
                )
                session.add(
                    ChannelDailyMetrics(
                        channel_id=c.id,
                        date=day,
                        subscribers_total=current_subscribers if (current_subscribers is not None and day == end_date) else None,
                        subscribers_gained=int(_get(row, "subscribersGained", 0) or 0),
                        subscribers_lost=int(_get(row, "subscribersLost", 0) or 0),
                        views=int(_get(row, "views", 0) or 0),
                        watch_time_minutes=int(round(float(_get(row, "estimatedMinutesWatched", 0) or 0.0))),
                        impressions=None,
                        click_through_rate=None,
                        estimated_revenue=float(_get(row, "estimatedRevenue", 0) or 0.0),
                        revenue_currency=None,
                    )
                )
            session.commit()

        try:
            hourly = await analytics_get_json(
                {
                    "ids": f"channel=={c.external_channel_id}",
                    "startDate": hourly_start_date.isoformat(),
                    "endDate": end_date.isoformat(),
                    "metrics": ",".join(metrics),
                    "dimensions": "day,hour",
                }
            )
        except httpx.HTTPStatusError:
            hourly = None
        if hourly:
            headers = [h["name"] for h in hourly.get("columnHeaders", [])]
            rows = hourly.get("rows", []) or []
            idx = {name: i for i, name in enumerate(headers)}

            def _get(row, name, default=None):
                i = idx.get(name)
                return row[i] if i is not None and i < len(row) else default

            for row in rows:
                day = dt.date.fromisoformat(_get(row, "day"))
                hour_val = int(_get(row, "hour", 0) or 0)
                hour_start = dt.datetime.combine(day, dt.time()) + dt.timedelta(hours=hour_val)
                session.execute(
                    sa.text(
                        "DELETE FROM channel_hourly_metrics WHERE channel_id = :cid AND hour_start = :hs"
                    ),
                    {"cid": c.id, "hs": hour_start},
                )
                session.add(
                    ChannelHourlyMetrics(
                        channel_id=c.id,
                        hour_start=hour_start,
                        views=int(_get(row, "views", 0) or 0),
                        watch_time_minutes=int(round(float(_get(row, "estimatedMinutesWatched", 0) or 0.0))),
                        impressions=None,
                        likes=None,
                        comments=None,
                        subscribers_gained=int(_get(row, "subscribersGained", 0) or 0),
                        estimated_revenue=float(_get(row, "estimatedRevenue", 0) or 0.0),
                    )
                )
            session.commit()

    await sync_channel_metrics()

    video_ids_external: list[str] = []
    next_page: str | None = None
    while True:
        params = {
            "part": "contentDetails,snippet",
            "playlistId": uploads,
            "maxResults": 50,
        }
        if next_page:
            params["pageToken"] = next_page
        page = await data_api_get(
            "https://www.googleapis.com/youtube/v3/playlistItems",
            params,
        )
        for it in page.get("items", []):
            content_details = it.get("contentDetails", {})
            vid_ext = content_details.get("videoId")
            if not vid_ext:
                continue
            snippet_item = it.get("snippet", {}) or {}
            title = snippet_item.get("title")
            published_at = content_details.get("videoPublishedAt") or snippet_item.get("publishedAt")
            thumbs = snippet_item.get("thumbnails", {}) or {}
            thumb = (
                thumbs.get("maxres", {}).get("url")
                or thumbs.get("high", {}).get("url")
                or thumbs.get("medium", {}).get("url")
                or thumbs.get("default", {}).get("url")
            )

            v = session.exec(
                select(Video).where(
                    Video.platform_id == c.platform_id,
                    Video.external_video_id == vid_ext,
                )
            ).first()
            if v:
                if title:
                    v.title = title
                if thumb:
                    v.thumbnail_url = thumb
                if published_at:
                    try:
                        v.published_at = dt.datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                    except Exception:
                        pass
                v.channel_id = c.id
                v.is_active = True
                session.add(v)
            else:
                v = Video(
                    platform_id=c.platform_id,
                    channel_id=c.id,
                    external_video_id=vid_ext,
                    title=title or "",
                    description=None,
                    category=None,
                    privacy_status=None,
                    content_type="video",
                    duration_seconds=None,
                    published_at=(dt.datetime.fromisoformat(published_at.replace("Z", "+00:00")) if published_at else None),
                    thumbnail_url=thumb,
                    tags=None,
                    last_synced_at=None,
                    is_active=True,
                )
                session.add(v)
            video_ids_external.append(vid_ext)
        session.commit()
        next_page = page.get("nextPageToken")
        if not next_page:
            break

    async def enrich_videos(video_ids: list[str]) -> None:
        nonlocal token
        if not video_ids:
            return
        for i in range(0, len(video_ids), 50):
            chunk = video_ids[i:i + 50]
            try:
                data = await data_api_get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    {
                        "part": "snippet,contentDetails,status",
                        "id": ",".join(chunk),
                    },
                )
            except httpx.HTTPStatusError:
                continue
            for item in data.get("items", []):
                vid_ext = item.get("id")
                if not vid_ext:
                    continue
                v = session.exec(
                    select(Video).where(
                        Video.platform_id == c.platform_id,
                        Video.external_video_id == vid_ext,
                    )
                ).first()
                if not v:
                    continue
                snippet_item = item.get("snippet", {}) or {}
                status_item = item.get("status", {}) or {}
                content_details = item.get("contentDetails", {}) or {}
                if snippet_item.get("title"):
                    v.title = snippet_item.get("title")
                if snippet_item.get("description") is not None:
                    v.description = snippet_item.get("description")
                if snippet_item.get("categoryId") is not None:
                    v.category = str(snippet_item.get("categoryId"))
                if snippet_item.get("publishedAt"):
                    try:
                        v.published_at = dt.datetime.fromisoformat(snippet_item.get("publishedAt").replace("Z", "+00:00"))
                    except Exception:
                        pass
                thumbs = snippet_item.get("thumbnails", {}) or {}
                thumb = (
                    thumbs.get("maxres", {}).get("url")
                    or thumbs.get("high", {}).get("url")
                    or thumbs.get("medium", {}).get("url")
                    or thumbs.get("default", {}).get("url")
                )
                if thumb:
                    v.thumbnail_url = thumb
                tags_value = snippet_item.get("tags")
                if tags_value is not None:
                    v.tags = tags_value
                if status_item.get("privacyStatus"):
                    v.privacy_status = status_item.get("privacyStatus")
                duration_seconds = _iso_duration_to_seconds(content_details.get("duration"))
                if duration_seconds is not None:
                    v.duration_seconds = duration_seconds
                    v.content_type = "short" if duration_seconds <= 60 else "video"
                v.last_synced_at = now
                session.add(v)
        session.commit()

    await enrich_videos(video_ids_external)

    video_ids_external = list(dict.fromkeys(video_ids_external))

    video_map = {
        v.external_video_id: v
        for v in session.exec(select(Video).where(Video.channel_id == c.id)).all()
    }

    # Per-video daily metrics
    inserted = 0
    videos_with_metrics: set[str] = set()

    for vid_ext in video_ids_external:
        params = {
            "ids": f"channel=={c.external_channel_id}",
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "metrics": ",".join([
                "views",
                "estimatedMinutesWatched",
                "averageViewDuration",
                "averageViewPercentage",
                "impressions",
                "impressionsClickThroughRate",
                "likes",
                "comments",
                "shares",
                "subscribersGained",
                "estimatedRevenue",
            ]),
            "dimensions": "day",
            "filters": f"video=={vid_ext}",
        }
        try:
            data = await analytics_get_json(params)
        except httpx.HTTPStatusError:
            continue

        headers = [h["name"] for h in data.get("columnHeaders", [])]
        rows = data.get("rows", []) or []
        idx = {name: i for i, name in enumerate(headers)}

        def _get(row, name, default=None):
            i = idx.get(name)
            return row[i] if i is not None and i < len(row) else default

        v = video_map.get(vid_ext)
        if not v:
            continue

        for row in rows:
            day = dt.date.fromisoformat(_get(row, "day"))
            emw = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)
            avgd = float(_get(row, "averageViewDuration", 0) or 0.0)
            avgp = float(_get(row, "averageViewPercentage", 0) or 0.0)
            impr = max(0, int(_get(row, "impressions", 0) or 0))
            ctr0_1 = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)
            likes = max(0, int(_get(row, "likes", 0) or 0))
            comments = max(0, int(_get(row, "comments", 0) or 0))
            shares = max(0, int(_get(row, "shares", 0) or 0))
            sg_vid = max(0, int(_get(row, "subscribersGained", 0) or 0))
            views = max(0, int(_get(row, "views", 0) or 0))
            rev = max(0.0, float(_get(row, "estimatedRevenue", 0) or 0.0))

            session.execute(
                sa.text(
                    "DELETE FROM video_daily_metrics WHERE video_id = :vid AND date = :d"
                ),
                {"vid": v.id, "d": day},
            )
            session.add(
                VideoDailyMetrics(
                    video_id=v.id,
                    date=day,
                    views=views,
                    watch_time_minutes=int(round(emw)),
                    avg_view_duration_seconds=int(round(avgd)),
                    avg_percent_viewed=avgp,
                    likes=likes,
                    comments=comments,
                    shares=shares,
                    impressions=impr,
                    click_through_rate=ctr0_1 * 100.0,
                    subs_gained_from_video=sg_vid,
                    estimated_revenue=rev,
                    revenue_currency=None,
                )
            )
            inserted += 1
            videos_with_metrics.add(vid_ext)
        v.last_synced_at = now
        session.add(v)
        session.commit()

    # Fallback snapshot for videos with no Analytics rows
    missing = [v for v in video_ids_external if v not in videos_with_metrics]
    if missing:
        batch = 50
        for i in range(0, len(missing), batch):
            ids = ",".join(missing[i:i + batch])
            try:
                stats_resp = await data_api_get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    {"part": "statistics", "id": ids},
                )
            except httpx.HTTPStatusError:
                continue
            for item in stats_resp.get("items", []):
                vid_ext = item.get("id")
                if not vid_ext:
                    continue
                st = item.get("statistics", {}) or {}
                views = max(0, int(st.get("viewCount", 0) or 0))
                likes = max(0, int(st.get("likeCount", 0) or 0))
                comments = max(0, int(st.get("commentCount", 0) or 0)) if st.get("commentCount") is not None else None

                v = video_map.get(vid_ext)
                if not v:
                    continue

                session.execute(
                    sa.text(
                        "DELETE FROM video_daily_metrics WHERE video_id = :vid AND date = :d"
                    ),
                    {"vid": v.id, "d": end_date},
                )
                session.add(
                    VideoDailyMetrics(
                        video_id=v.id,
                        date=end_date,
                        views=views,
                        watch_time_minutes=None,
                        avg_view_duration_seconds=None,
                        avg_percent_viewed=None,
                        likes=likes,
                        comments=comments,
                        shares=None,
                        impressions=None,
                        click_through_rate=None,
                        subs_gained_from_video=None,
                        estimated_revenue=None,
                        revenue_currency=None,
                    )
                )
                v.last_synced_at = now
                session.add(v)
            session.commit()

    async def sync_video_hourly_metrics(video_ids: list[str]) -> None:
        if not video_ids:
            return
        metrics = [
            "views",
            "estimatedMinutesWatched",
            "impressions",
            "likes",
            "comments",
            "shares",
            "subscribersGained",
            "estimatedRevenue",
        ]
        for vid_ext in video_ids:
            v = video_map.get(vid_ext)
            if not v:
                continue
            params = {
                "ids": f"channel=={c.external_channel_id}",
                "startDate": hourly_start_date.isoformat(),
                "endDate": end_date.isoformat(),
                "metrics": ",".join(metrics),
                "dimensions": "day,hour",
                "filters": f"video=={vid_ext}",
            }
            try:
                data = await analytics_get_json(params)
            except httpx.HTTPStatusError:
                continue
            headers = [h["name"] for h in data.get("columnHeaders", [])]
            rows = data.get("rows", []) or []
            idx = {name: i for i, name in enumerate(headers)}

            def _get(row, name, default=None):
                i = idx.get(name)
                return row[i] if i is not None and i < len(row) else default

            for row in rows:
                day = dt.date.fromisoformat(_get(row, "day"))
                hour_val = int(_get(row, "hour", 0) or 0)
                hour_start = dt.datetime.combine(day, dt.time()) + dt.timedelta(hours=hour_val)
                session.execute(
                    sa.text(
                        "DELETE FROM video_hourly_metrics WHERE video_id = :vid AND hour_start = :hs"
                    ),
                    {"vid": v.id, "hs": hour_start},
                )
                session.add(
                    VideoHourlyMetrics(
                        video_id=v.id,
                        hour_start=hour_start,
                        views=int(_get(row, "views", 0) or 0),
                        watch_time_minutes=int(round(float(_get(row, "estimatedMinutesWatched", 0) or 0.0))),
                        impressions=int(_get(row, "impressions", 0) or 0),
                        likes=int(_get(row, "likes", 0) or 0),
                        comments=int(_get(row, "comments", 0) or 0),
                        shares=int(_get(row, "shares", 0) or 0),
                        subs_gained_from_video=int(_get(row, "subscribersGained", 0) or 0),
                        estimated_revenue=float(_get(row, "estimatedRevenue", 0) or 0.0),
                    )
                )
            session.commit()

    await sync_video_hourly_metrics(video_ids_external)

    try:
        c.last_synced_at = now
        session.add(c)
        session.commit()
    except Exception:
        pass

    return {"ok": True, "videos": len(video_ids_external), "rows": inserted}

@router.post("/sync/auto")
async def sync_auto(
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    chans = session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.is_active == True)
    ).all()
    ran = 0
    errors: list[dict] = []
    for c in chans:
        if not c.last_synced_at or (dt.datetime.now(dt.UTC) - c.last_synced_at).total_seconds() > 8 * 3600:
            try:
                await sync_full(channel_id=c.id, days=180, request=request, user_id=user_id, session=session)  # type: ignore
                ran += 1
            except Exception as e:
                errors.append({"channel_id": c.id, "error": str(e)})
                continue
    return {"ok": True, "synced": ran, "total": len(chans), "errors": errors}

# ----------------------------
# Manual sync (no legacy daily limits)
# ----------------------------
@router.post("/sync/manual")
async def sync_manual(
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    chans = session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.is_active == True)
    ).all()
    errs: list[dict] = []
    ok_count = 0
    for c in chans:
        try:
            await sync_full(channel_id=c.id, days=180, request=request, user_id=user_id, session=session)  # type: ignore
            ok_count += 1
        except Exception as e:
            errs.append({"channel_id": c.id, "error": str(e)})
    return {"ok": True, "refreshed_channels": ok_count, "errors": errs}

# ----------------------------
# Aggregate per-video totals across all days
# ----------------------------
@router.get("/videos/summary")
def videos_summary(
    channel_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")

    stmt = sa.text(
        """
        SELECT v.id as video_id, v.external_video_id, v.title, v.thumbnail_url,
               v.published_at, v.duration_seconds, v.content_type,
               COALESCE(SUM(m.views), 0) as views,
               COALESCE(SUM(m.watch_time_minutes), 0) as watch_time_minutes,
               SUM(COALESCE(m.likes,0)) as likes,
               SUM(COALESCE(m.comments,0)) as comments,
               SUM(COALESCE(m.shares,0)) as shares,
               SUM(COALESCE(m.subs_gained_from_video,0)) as subs_gained_from_video,
               SUM(COALESCE(m.estimated_revenue,0)) as estimated_revenue,
               SUM(COALESCE(m.impressions,0)) as impressions,
               AVG(COALESCE(m.click_through_rate,0)) as click_through_rate,
               AVG(COALESCE(m.avg_view_duration_seconds,0)) as avg_view_duration_seconds,
               AVG(COALESCE(m.avg_percent_viewed,0)) as avg_percent_viewed
        FROM video v
        LEFT JOIN video_daily_metrics m ON m.video_id = v.id
        WHERE v.channel_id = :cid AND v.is_active = TRUE
        GROUP BY v.id, v.external_video_id, v.title, v.thumbnail_url,
                 v.published_at, v.duration_seconds, v.content_type
        ORDER BY views DESC
        """
    ).bindparams(sa.bindparam("cid", value=c.id))
    q = session.exec(stmt).all()
    rows = [dict(r._mapping) for r in q]
    return {"ok": True, "videos": rows}


# ----------------------------
# Aggregated Overview (one round-trip for the dashboard)
# ----------------------------
@router.get("/overview")
async def overview(
    days: int = 28,
    channel_id: int | None = None,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Aggregated dashboard for the user's whole account.

    Pass channel_id to restrict to a single channel (must be owned by user).
    Returns: totals, prior-period totals (for deltas), per-channel time series
    (one line per channel in the chart), channel leaderboard, top videos mixed.
    """
    days = max(1, min(days, 365))
    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=days - 1)
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=days - 1)

    # Channels the user owns (optionally filtered to one channel)
    chans_query = (
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.is_active == True)  # noqa: E712
    )
    if channel_id is not None:
        chans_query = chans_query.where(Channel.id == channel_id)
    chans = session.exec(chans_query).all()
    if not chans:
        return {
            "ok": True,
            "days": days,
            "totals": _empty_totals(),
            "prev_totals": _empty_totals(),
            "channels": [],
            "series_by_channel": [],
            "top_videos": [],
        }
    chan_ids = [c.id for c in chans]
    placeholders = ",".join(f":id{i}" for i in range(len(chan_ids)))
    bindings = {f"id{i}": cid for i, cid in enumerate(chan_ids)}

    def _totals_for(p_start: dt.date, p_end: dt.date) -> dict:
        stmt = sa.text(
            f"""
            SELECT
              COALESCE(SUM(views), 0)               AS views,
              COALESCE(SUM(watch_time_minutes), 0)  AS watch_time_minutes,
              COALESCE(SUM(subscribers_gained), 0)  AS subs_gained,
              COALESCE(SUM(subscribers_lost), 0)    AS subs_lost,
              COALESCE(SUM(estimated_revenue), 0)   AS estimated_revenue
            FROM channel_daily_metrics
            WHERE channel_id IN ({placeholders})
              AND date BETWEEN :start AND :end
            """
        ).bindparams(**bindings, start=p_start, end=p_end)
        row = session.exec(stmt).first()
        m = dict(row._mapping) if row else {}
        return {
            "views": int(m.get("views") or 0),
            "watch_time_minutes": int(m.get("watch_time_minutes") or 0),
            "subs_net": int((m.get("subs_gained") or 0) - (m.get("subs_lost") or 0)),
            "estimated_revenue": float(m.get("estimated_revenue") or 0.0),
        }

    totals = _totals_for(start, end)
    prev_totals = _totals_for(prev_start, prev_end)

    # Per-channel time series + per-channel period summary (one query each)
    series_stmt = sa.text(
        f"""
        SELECT channel_id, date,
               COALESCE(views, 0) AS views,
               COALESCE(watch_time_minutes, 0) AS watch_time_minutes,
               COALESCE(subscribers_gained, 0) - COALESCE(subscribers_lost, 0) AS subs_net
        FROM channel_daily_metrics
        WHERE channel_id IN ({placeholders})
          AND date BETWEEN :start AND :end
        ORDER BY channel_id, date
        """
    ).bindparams(**bindings, start=start, end=end)
    by_chan: dict[int, list[dict]] = {cid: [] for cid in chan_ids}
    for r in session.exec(series_stmt).all():
        m = dict(r._mapping)
        by_chan.setdefault(m["channel_id"], []).append(
            {
                "date": m["date"].isoformat() if hasattr(m["date"], "isoformat") else str(m["date"]),
                "views": int(m["views"] or 0),
                "watch_time_minutes": int(m["watch_time_minutes"] or 0),
                "subs_net": int(m["subs_net"] or 0),
            }
        )

    # Per-channel period summary
    sum_stmt = sa.text(
        f"""
        SELECT channel_id,
               COALESCE(SUM(views), 0) AS views,
               COALESCE(SUM(watch_time_minutes), 0) AS watch_time_minutes,
               COALESCE(SUM(subscribers_gained), 0) - COALESCE(SUM(subscribers_lost), 0) AS subs_net,
               COALESCE(SUM(estimated_revenue), 0) AS estimated_revenue
        FROM channel_daily_metrics
        WHERE channel_id IN ({placeholders})
          AND date BETWEEN :start AND :end
        GROUP BY channel_id
        """
    ).bindparams(**bindings, start=start, end=end)
    period_by_chan: dict[int, dict] = {}
    for r in session.exec(sum_stmt).all():
        m = dict(r._mapping)
        period_by_chan[m["channel_id"]] = {
            "views": int(m["views"] or 0),
            "watch_time_minutes": int(m["watch_time_minutes"] or 0),
            "subs_net": int(m["subs_net"] or 0),
            "estimated_revenue": float(m["estimated_revenue"] or 0.0),
        }

    # Prev period per-channel views (for delta %)
    prev_stmt = sa.text(
        f"""
        SELECT channel_id, COALESCE(SUM(views), 0) AS views
        FROM channel_daily_metrics
        WHERE channel_id IN ({placeholders})
          AND date BETWEEN :start AND :end
        GROUP BY channel_id
        """
    ).bindparams(**bindings, start=prev_start, end=prev_end)
    prev_by_chan: dict[int, int] = {}
    for r in session.exec(prev_stmt).all():
        m = dict(r._mapping)
        prev_by_chan[m["channel_id"]] = int(m["views"] or 0)

    channels_out = []
    for c in chans:
        cur = period_by_chan.get(c.id, {"views": 0, "watch_time_minutes": 0, "subs_net": 0, "estimated_revenue": 0.0})
        prev = prev_by_chan.get(c.id, 0)
        delta_pct = None
        if prev > 0:
            delta_pct = round(((cur["views"] - prev) / prev) * 100.0, 1)
        channels_out.append(
            {
                "id": c.id,
                "title": c.title,
                "avatar_url": c.avatar_url,
                "custom_url": c.custom_url,
                "subscriber_count": c.subscriber_count,
                "views": cur["views"],
                "watch_time_minutes": cur["watch_time_minutes"],
                "subs_net": cur["subs_net"],
                "estimated_revenue": cur["estimated_revenue"],
                "views_delta_pct": delta_pct,
            }
        )

    series_by_channel = []
    for c in chans:
        series_by_channel.append(
            {
                "channel_id": c.id,
                "title": c.title,
                "avatar_url": c.avatar_url,
                "daily": by_chan.get(c.id, []),
            }
        )

    # Top videos mixed (last N days) across all channels — with engagement metrics
    top_stmt = sa.text(
        f"""
        SELECT v.id AS video_id, v.external_video_id, v.title, v.thumbnail_url,
               v.content_type, v.channel_id, c.title AS channel_title, c.avatar_url AS channel_avatar_url,
               v.published_at,
               COALESCE(SUM(m.views), 0) AS views,
               COALESCE(SUM(m.likes), 0) AS likes,
               COALESCE(SUM(m.comments), 0) AS comments,
               COALESCE(SUM(m.shares), 0) AS shares
        FROM video v
        JOIN channel c ON c.id = v.channel_id
        LEFT JOIN video_daily_metrics m
               ON m.video_id = v.id AND m.date BETWEEN :start AND :end
        WHERE v.channel_id IN ({placeholders}) AND v.is_active = TRUE
        GROUP BY v.id, v.external_video_id, v.title, v.thumbnail_url,
                 v.content_type, v.channel_id, c.title, c.avatar_url, v.published_at
        HAVING COALESCE(SUM(m.views), 0) > 0
        ORDER BY views DESC
        LIMIT 20
        """
    ).bindparams(**bindings, start=start, end=end)
    top_videos = [dict(r._mapping) for r in session.exec(top_stmt).all()]

    return {
        "ok": True,
        "days": days,
        "totals": totals,
        "prev_totals": prev_totals,
        "channels": channels_out,
        "series_by_channel": series_by_channel,
        "top_videos": top_videos,
    }


def _empty_totals() -> dict:
    return {"views": 0, "watch_time_minutes": 0, "subs_net": 0, "estimated_revenue": 0.0}


# ----------------------------
# Explore (YT-Studio Advanced Mode style pivot)
# ----------------------------
_EXPLORE_METRICS = {
    # name: (sql expression on channel_daily_metrics, formatter hint)
    "views": "SUM(views)",
    "watch_time_minutes": "SUM(watch_time_minutes)",
    "subscribers_gained": "SUM(COALESCE(subscribers_gained, 0))",
    "subscribers_lost": "SUM(COALESCE(subscribers_lost, 0))",
    "subscribers_net": "SUM(COALESCE(subscribers_gained, 0) - COALESCE(subscribers_lost, 0))",
    "estimated_revenue": "SUM(COALESCE(estimated_revenue, 0))",
}
_EXPLORE_VIDEO_METRICS = {
    "views": "SUM(views)",
    "watch_time_minutes": "SUM(watch_time_minutes)",
    "likes": "SUM(COALESCE(likes, 0))",
    "comments": "SUM(COALESCE(comments, 0))",
    "shares": "SUM(COALESCE(shares, 0))",
    "estimated_revenue": "SUM(COALESCE(estimated_revenue, 0))",
}
_EXPLORE_DIMENSIONS = {"time", "channel", "video", "content_type"}
_EXPLORE_GROUP_BY = {"none", "channel", "content_type"}


@router.get("/explore")
async def explore(
    metric: str = "views",
    dimension: str = "time",
    group_by: str = "none",
    days: int = 28,
    channel_id: int | None = None,
    content_type: str | None = None,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Pivot endpoint: pick one metric, one dimension (X-axis or rows),
    optionally one group-by (= series / columns), with simple filters.

    Source tables:
      - dimension=time | channel  → channel_daily_metrics (channel-level)
      - dimension=video | content_type → video_daily_metrics (video-level)
    """
    if metric not in _EXPLORE_METRICS and metric not in _EXPLORE_VIDEO_METRICS:
        raise HTTPException(status_code=400, detail=f"unknown metric: {metric}")
    if dimension not in _EXPLORE_DIMENSIONS:
        raise HTTPException(status_code=400, detail=f"unknown dimension: {dimension}")
    if group_by not in _EXPLORE_GROUP_BY:
        raise HTTPException(status_code=400, detail=f"unknown group_by: {group_by}")

    days = max(1, min(days, 365))
    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=days - 1)

    # User-owned channels
    chans = session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.is_active == True)  # noqa: E712
    ).all()
    if not chans:
        return {"ok": True, "rows": [], "series_keys": [], "x_label": dimension, "y_label": metric}

    if channel_id is not None:
        chans = [c for c in chans if c.id == channel_id]
        if not chans:
            raise HTTPException(status_code=404, detail="channel not found")
    chan_ids = [c.id for c in chans]
    placeholders = ",".join(f":id{i}" for i in range(len(chan_ids)))
    bindings = {f"id{i}": cid for i, cid in enumerate(chan_ids)}

    use_video_table = dimension in {"video", "content_type"}
    metric_map = _EXPLORE_VIDEO_METRICS if use_video_table else _EXPLORE_METRICS
    if metric not in metric_map:
        raise HTTPException(
            status_code=400,
            detail=f"metric '{metric}' not available for dimension '{dimension}'",
        )
    metric_expr = metric_map[metric]

    # Channel name map for friendly labels
    chan_titles = {c.id: (c.title or f"Channel {c.id}") for c in chans}

    def _content_type_filter_sql(prefix: str) -> str:
        if content_type in ("short", "video"):
            return f"AND {prefix}.content_type = :ct "
        return ""

    if use_video_table:
        if group_by == "channel":
            stmt_text = f"""
                SELECT {dimension_col(dimension)} AS x,
                       v.channel_id AS g,
                       {metric_expr} AS y
                FROM video v
                LEFT JOIN video_daily_metrics m
                       ON m.video_id = v.id AND m.date BETWEEN :start AND :end
                WHERE v.channel_id IN ({placeholders}) AND v.is_active = TRUE
                  {_content_type_filter_sql("v")}
                GROUP BY x, g
                ORDER BY y DESC
                LIMIT 200
            """
        elif group_by == "content_type":
            stmt_text = f"""
                SELECT {dimension_col(dimension)} AS x,
                       COALESCE(v.content_type, 'unknown') AS g,
                       {metric_expr} AS y
                FROM video v
                LEFT JOIN video_daily_metrics m
                       ON m.video_id = v.id AND m.date BETWEEN :start AND :end
                WHERE v.channel_id IN ({placeholders}) AND v.is_active = TRUE
                  {_content_type_filter_sql("v")}
                GROUP BY x, g
                ORDER BY y DESC
                LIMIT 200
            """
        else:
            stmt_text = f"""
                SELECT {dimension_col(dimension)} AS x,
                       NULL AS g,
                       {metric_expr} AS y
                FROM video v
                LEFT JOIN video_daily_metrics m
                       ON m.video_id = v.id AND m.date BETWEEN :start AND :end
                WHERE v.channel_id IN ({placeholders}) AND v.is_active = TRUE
                  {_content_type_filter_sql("v")}
                GROUP BY x
                ORDER BY y DESC
                LIMIT 200
            """
        params = {**bindings, "start": start, "end": end}
        if content_type in ("short", "video"):
            params["ct"] = content_type
        stmt = sa.text(stmt_text).bindparams(**params)
    else:
        # channel_daily_metrics path
        if dimension == "time":
            x_expr = "m.date"
        elif dimension == "channel":
            x_expr = "m.channel_id"
        else:
            raise HTTPException(status_code=400, detail="unsupported dimension")

        if group_by == "channel":
            g_expr = "m.channel_id"
        elif group_by == "content_type":
            raise HTTPException(
                status_code=400,
                detail="group_by=content_type requires dimension in (video, content_type)",
            )
        else:
            g_expr = "NULL"

        stmt_text = f"""
            SELECT {x_expr} AS x,
                   {g_expr} AS g,
                   {metric_expr} AS y
            FROM channel_daily_metrics m
            WHERE m.channel_id IN ({placeholders})
              AND m.date BETWEEN :start AND :end
            GROUP BY x, g
            ORDER BY x ASC
        """
        stmt = sa.text(stmt_text).bindparams(**bindings, start=start, end=end)

    raw = [dict(r._mapping) for r in session.exec(stmt).all()]

    # Friendly labels
    def label_x(x):
        if dimension == "time":
            return x.isoformat() if hasattr(x, "isoformat") else str(x)
        if dimension == "channel":
            try:
                return chan_titles.get(int(x), str(x))
            except (ValueError, TypeError):
                return str(x)
        if dimension == "content_type":
            return "Shorts" if x == "short" else "Long-form" if x == "video" else str(x)
        return str(x) if x is not None else "—"

    def label_g(g):
        if group_by == "channel":
            try:
                return chan_titles.get(int(g), str(g))
            except (ValueError, TypeError):
                return str(g)
        if group_by == "content_type":
            return "Shorts" if g == "short" else "Long-form" if g == "video" else str(g)
        return None

    rows = []
    series_keys: list[str] = []
    seen_keys: set[str] = set()
    for r in raw:
        x = label_x(r["x"])
        g = label_g(r["g"])
        rows.append({"x": x, "g": g, "y": float(r["y"] or 0)})
        if g and g not in seen_keys:
            seen_keys.add(g)
            series_keys.append(g)

    return {
        "ok": True,
        "metric": metric,
        "dimension": dimension,
        "group_by": group_by,
        "days": days,
        "x_label": dimension,
        "y_label": metric,
        "series_keys": series_keys,
        "rows": rows,
    }


def dimension_col(dimension: str) -> str:
    """SQL column for the X-axis dimension. Only called from /explore."""
    if dimension == "time":
        return "m.date"
    if dimension == "channel":
        return "v.channel_id"
    if dimension == "video":
        return "v.id"
    if dimension == "content_type":
        return "COALESCE(v.content_type, 'unknown')"
    raise ValueError(f"bad dimension {dimension}")


# ----------------------------
# Time series for charts (channel)
# ----------------------------
@router.get("/channel/timeseries")
def channel_timeseries(
    channel_id: int | None = None,
    days: int = 28,
    all: bool = False,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=max(1, days) - 1)

    if all:
        chan_ids = [
            cid for (cid,) in session.exec(
                select(Channel.id)
                .join(UserChannel, UserChannel.channel_id == Channel.id)
                .where(UserChannel.user_id == user_id, Channel.is_active == True)
            ).all()
        ]
        if not chan_ids:
            return {"ok": True, "series": []}
        placeholders = ",".join([f":id{i}" for i in range(len(chan_ids))])
        stmt = sa.text(
            f"""
            SELECT date,
                   SUM(views) as views,
                   SUM(watch_time_minutes) as watch_time_minutes,
                   SUM(COALESCE(subscribers_gained,0)) as subscribers_gained,
                   SUM(COALESCE(subscribers_lost,0)) as subscribers_lost,
                   SUM(COALESCE(estimated_revenue,0)) as estimated_revenue
            FROM channel_daily_metrics
            WHERE channel_id IN ({placeholders}) AND date BETWEEN :start AND :end
            GROUP BY date
            ORDER BY date
            """
        ).bindparams(**{f"id{i}": cid for i, cid in enumerate(chan_ids)}, start=start, end=end)
        rows = session.exec(stmt).all()
    else:
        if channel_id is None:
            raise HTTPException(status_code=400, detail="channel_id required when all=false")
        c = _user_channel(session, user_id, channel_id)
        if not c:
            raise HTTPException(status_code=404, detail="channel not found")
        stmt = sa.text(
            """
            SELECT date,
                   views,
                   watch_time_minutes,
                   COALESCE(subscribers_gained,0) as subscribers_gained,
                   COALESCE(subscribers_lost,0) as subscribers_lost,
                   COALESCE(estimated_revenue,0) as estimated_revenue
            FROM channel_daily_metrics
            WHERE channel_id = :cid AND date BETWEEN :start AND :end
            ORDER BY date
            """
        ).bindparams(cid=c.id, start=start, end=end)
        rows = session.exec(stmt).all()

    return {"ok": True, "series": [dict(r._mapping) for r in rows]}

# ----------------------------
# Time series for charts (video)
# ----------------------------
@router.get("/video/timeseries")
def video_timeseries(
    channel_id: int,
    yt_video_id: str,
    days: int = 28,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = _user_channel(session, user_id, channel_id)
    if not c:
        raise HTTPException(status_code=404, detail="channel not found")

    v = session.exec(
        select(Video).where(
            Video.channel_id == c.id,
            Video.external_video_id == yt_video_id,
        )
    ).first()
    if not v:
        raise HTTPException(status_code=404, detail="video not found")

    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=max(1, days) - 1)
    stmt = sa.text(
        """
        SELECT date, views, watch_time_minutes, impressions, click_through_rate,
               avg_view_duration_seconds, avg_percent_viewed, likes, comments, shares,
               subs_gained_from_video, estimated_revenue
        FROM video_daily_metrics
        WHERE video_id = :vid AND date BETWEEN :start AND :end
        ORDER BY date
        """
    ).bindparams(vid=v.id, start=start, end=end)
    rows = session.exec(stmt).all()
    return {"ok": True, "series": [dict(r._mapping) for r in rows]}

# ----------------------------
# Per-video detail (on-demand) — Phase 3.6
# ----------------------------
_VIDEO_SYNC_COOLDOWN_SECS = 24 * 3600
_VIDEO_METRICS = [
    "views",
    "estimatedMinutesWatched",
    "averageViewDuration",
    "averageViewPercentage",
    "likes",
    "comments",
    "shares",
    "subscribersGained",
]


@router.get("/videos/{video_id}")
async def get_video(
    video_id: int,
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    pair = _user_video(session, user_id, video_id)
    if not pair:
        raise HTTPException(status_code=404, detail="video not found")
    v, c = pair

    # Last 180 days of daily metrics
    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=179)
    stmt = sa.text(
        """
        SELECT date, views, watch_time_minutes,
               COALESCE(avg_view_duration_seconds, 0) AS avg_view_duration_seconds,
               COALESCE(avg_percent_viewed, 0) AS avg_percent_viewed,
               COALESCE(likes, 0) AS likes,
               COALESCE(comments, 0) AS comments,
               COALESCE(shares, 0) AS shares
        FROM video_daily_metrics
        WHERE video_id = :vid AND date BETWEEN :start AND :end
        ORDER BY date
        """
    ).bindparams(vid=v.id, start=start, end=end)
    series = [dict(r._mapping) for r in session.exec(stmt).all()]

    # Live lifetime stats from YouTube Data API (avoids Analytics 24-48h lag).
    # Best-effort: if the call fails, return Nones — UI falls back gracefully.
    lifetime = {"views": None, "likes": None, "comments": None}
    try:
        token = await get_valid_access_token_for_channel(request, session, c.id)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"part": "statistics", "id": v.external_video_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            items = resp.json().get("items") or []
            if items:
                st = items[0].get("statistics") or {}
                lifetime = {
                    "views": int(st["viewCount"]) if st.get("viewCount") is not None else None,
                    "likes": int(st["likeCount"]) if st.get("likeCount") is not None else None,
                    "comments": int(st["commentCount"]) if st.get("commentCount") is not None else None,
                }
    except Exception:
        pass

    return {
        "ok": True,
        "video": {
            "id": v.id,
            "external_video_id": v.external_video_id,
            "title": v.title,
            "description": v.description,
            "thumbnail_url": v.thumbnail_url,
            "duration_seconds": v.duration_seconds,
            "published_at": v.published_at,
            "content_type": v.content_type,
            "channel_id": c.id,
            "channel_title": c.title,
            "last_synced_at": v.last_synced_at,
        },
        "lifetime": lifetime,
        "series": series,
    }


@router.post("/videos/{video_id}/sync")
async def sync_video(
    video_id: int,
    days: int = 180,
    force: bool = False,
    request: Request = ...,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Pull full per-video analytics on demand. Cached for 24h unless force=true."""
    pair = _user_video(session, user_id, video_id)
    if not pair:
        raise HTTPException(status_code=404, detail="video not found")
    v, c = pair

    now = dt.datetime.now(dt.UTC)
    if (
        not force
        and v.last_synced_at
        and (now - v.last_synced_at).total_seconds() < _VIDEO_SYNC_COOLDOWN_SECS
    ):
        return {"ok": True, "skipped": True, "reason": "recently_synced"}

    try:
        token = await get_valid_access_token_for_channel(request, session, c.id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=max(1, days) - 1)

    params = {
        "ids": f"channel=={c.external_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": ",".join(_VIDEO_METRICS),
        "dimensions": "day",
        "filters": f"video=={v.external_video_id}",
    }
    resp = await _yt_analytics_get(request, token, params)
    if resp.status_code == 401:
        token = await get_valid_access_token_for_channel(request, session, c.id)
        resp = await _yt_analytics_get(request, token, params)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])

    data = resp.json()
    headers = [h["name"] for h in data.get("columnHeaders", [])]
    rows = data.get("rows", []) or []
    idx = {name: i for i, name in enumerate(headers)}

    def _get(row, name, default=None):
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else default

    inserted = 0
    for row in rows:
        try:
            day = dt.date.fromisoformat(_get(row, "day"))
        except (TypeError, ValueError):
            continue
        session.execute(
            sa.text(
                "DELETE FROM video_daily_metrics WHERE video_id = :vid AND date = :d"
            ),
            {"vid": v.id, "d": day},
        )
        session.add(
            VideoDailyMetrics(
                video_id=v.id,
                date=day,
                views=max(0, int(_get(row, "views", 0) or 0)),
                watch_time_minutes=max(0, int(round(float(_get(row, "estimatedMinutesWatched", 0) or 0.0)))),
                avg_view_duration_seconds=max(0, int(round(float(_get(row, "averageViewDuration", 0) or 0.0)))),
                avg_percent_viewed=max(0.0, float(_get(row, "averageViewPercentage", 0) or 0.0)),
                likes=max(0, int(_get(row, "likes", 0) or 0)),
                comments=max(0, int(_get(row, "comments", 0) or 0)),
                shares=max(0, int(_get(row, "shares", 0) or 0)),
                subs_gained_from_video=max(0, int(_get(row, "subscribersGained", 0) or 0)),
            )
        )
        inserted += 1

    v.last_synced_at = now
    session.add(v)
    session.commit()
    return {"ok": True, "inserted_rows": inserted}


@router.get("/videos/{video_id}/retention")
async def video_retention(
    video_id: int,
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Pull the YouTube retention curve for a single video (live)."""
    pair = _user_video(session, user_id, video_id)
    if not pair:
        raise HTTPException(status_code=404, detail="video not found")
    v, c = pair

    try:
        token = await get_valid_access_token_for_channel(request, session, c.id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Retention API needs a date range — use the lifetime of the video
    end = dt.datetime.now(dt.UTC).date()
    start = (v.published_at.date() if v.published_at else end - dt.timedelta(days=365))
    if start > end:
        start = end - dt.timedelta(days=1)

    params = {
        "ids": f"channel=={c.external_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": "audienceWatchRatio,relativeRetentionPerformance",
        "dimensions": "elapsedVideoTimeRatio",
        "filters": f"video=={v.external_video_id}",
    }
    resp = await _yt_analytics_get(request, token, params)
    if resp.status_code == 401:
        token = await get_valid_access_token_for_channel(request, session, c.id)
        resp = await _yt_analytics_get(request, token, params)
    if resp.status_code >= 400:
        return {"ok": False, "available": False, "reason": resp.text[:200], "points": []}

    data = resp.json()
    headers = [h["name"] for h in data.get("columnHeaders", [])]
    rows = data.get("rows", []) or []
    idx = {name: i for i, name in enumerate(headers)}

    points = []
    for row in rows:
        try:
            t = float(row[idx["elapsedVideoTimeRatio"]])
            ratio = float(row[idx["audienceWatchRatio"]])
        except (KeyError, IndexError, ValueError, TypeError):
            continue
        rel = None
        if "relativeRetentionPerformance" in idx:
            try:
                rel = float(row[idx["relativeRetentionPerformance"]])
            except (ValueError, TypeError):
                rel = None
        points.append({"t": t, "ratio": ratio, "relative": rel})

    return {"ok": True, "available": len(points) > 0, "points": points}

# ----------------------------
# Debug (legacy path): googleaccount status (mapped to new schema)
# ----------------------------
@router.get("/debug/googleaccount")
def debug_googleaccount(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    Legacy debug endpoint preserved. Reports new-schema fields.
    """
    yt = session.exec(select(Platform).where(Platform.name == "youtube")).first()
    if not yt:
        raise HTTPException(status_code=404, detail="no youtube platform")

    pa = session.exec(
        select(PlatformAccount).where(
            PlatformAccount.platform_id == yt.id, PlatformAccount.owner_user_id == user_id
        )
    ).first()
    if not pa:
        raise HTTPException(status_code=404, detail="no platform account")

    cred = session.exec(
        select(OAuthCredential).where(OAuthCredential.platform_account_id == pa.id)
    ).first()

    return {
        "ok": True,
        "user_id": user_id,
        # legacy key kept for compatibility:
        "google_account_id": None,
        # new fields:
        "platform_account_id": pa.id,
        "has_access_token": bool(getattr(cred, "access_token_encrypted", None)) if cred else False,
        "has_refresh_token": bool(getattr(cred, "refresh_token_encrypted", None)) if cred else False,
        "expires_at": str(getattr(cred, "expires_at", None)) if cred else None,
        "created_at": str(getattr(pa, "created_at", None)) if getattr(pa, "created_at", None) else None,
    }
