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
from ..db.models import User

router = APIRouter()

async def _yt_analytics_get(request, token: str, params: dict):
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.get(
            "https://youtubeanalytics.googleapis.com/v2/reports",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )


async def _ingest_breakdown(
    request: Request,
    session: Session,
    c: Channel,
    vid: str,
    token: str,
    start: dt.date,
    end: dt.date,
    dimension: str,
    metrics: list[str],
    key_header: str,
):
    from ..db.models import MetricBreakdownDaily
    params = {
        "ids": f"channel=={c.yt_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": ",".join(metrics),
        "dimensions": f"day,{dimension}",
        "filters": f"video=={vid}",
    }
    r = await _yt_analytics_get(request, token, params)
    if r.status_code == 401:
        ga = session.get(GoogleAccount, c.google_account_id)
        if ga:
            token = await refresh_and_persist_access_token(request, session, ga)
            r = await _yt_analytics_get(request, token, params)
    try:
        r.raise_for_status()
    except httpx.HTTPStatusError:
        return 0
    data = r.json()
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
        except Exception:
            continue
        # Compose key. For age/gender combined dimensions, capture both.
        if dimension == "ageGroup,gender":
            age = _get(row, "ageGroup")
            gen = _get(row, "gender")
            key = f"{age}|{gen}"
        else:
            key = _get(row, key_header)
        if key is None:
            # some responses may use a different header name; pick the first non-day string column
            for h in headers:
                if h not in ("day",) and not h.startswith("_") and h not in metrics:
                    key = _get(row, h)
                    if key is not None:
                        break
        views = int(_get(row, "views", 0) or 0)
        wt = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)
        impr = int(_get(row, "impressions", 0) or 0)
        ctr = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)
        likes = int(_get(row, "likes", 0) or 0)
        sg = int(_get(row, "subscribersGained", 0) or 0)
        sl = int(_get(row, "subscribersLost", 0) or 0)
        rev = float(_get(row, "estimatedRevenue", 0) or 0.0)
        # delete+insert
        session.exec(
            sa.text(
                "DELETE FROM metricbreakdowndaily WHERE channel_id=:cid AND video_id=:vid AND date=:d AND dimension=:dim AND key=:k"
            ),
            {"cid": c.id, "vid": vid, "d": day, "dim": dimension, "k": str(key)},
        )
        session.add(MetricBreakdownDaily(
            channel_id=c.id,
            video_id=vid,
            date=day,
            dimension=dimension,
            key=str(key),
            views=views,
            watch_time_min=int(round(wt)),
            impressions=impr,
            impressions_ctr_pct=ctr * 100.0,
            likes=likes,
            subs_gained=sg,
            subs_lost=sl,
            est_revenue_minor=int(round(rev*100)),
        ))
        inserted += 1
    session.commit()
    return inserted


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
    # include quota & remaining
    from ..db.models import User
    u = session.get(User, user_id)
    quota = getattr(u, "link_quota", None)
    total = len(chans)
    remaining = None if quota is None else max(0, int(quota) - total)
    return {
        "ok": True,
        "quota": quota,
        "total": total,
        "remaining": remaining,
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
        "metrics": ",".join([
            "views",
            "estimatedMinutesWatched",
            "averageViewDuration",
            "averageViewPercentage",
            "impressions",
            "impressionsClickThroughRate",
            "likes",
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
        wt = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)  # minutes
        avgd = float(_get(row, "averageViewDuration", 0) or 0.0)  # seconds
        avgp = float(_get(row, "averageViewPercentage", 0) or 0.0)
        impr = int(_get(row, "impressions", 0) or 0)
        ctr = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)  # 0..1
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
                watch_time_min=int(round(wt)),  # minutes
                avg_view_duration_sec=int(round(avgd)),  # seconds
                impressions=impr,
                impressions_ctr_pct=ctr * 100.0,  # 0..1 -> %
                avg_pct_viewed=avgp,
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


# ----------------------------
# List videos known for a channel (from VideoMap)
# ----------------------------
@router.get("/videos")
def list_videos(
    channel_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = session.get(Channel, channel_id)
    if not c or c.user_id != user_id:
        raise HTTPException(status_code=404, detail="channel not found")
    from ..db.models import VideoMap
    vids = session.exec(select(VideoMap).where(VideoMap.channel_id == c.id)).all()
    return {
        "ok": True,
        "videos": [
            {
                "id": v.id,
                "yt_video_id": v.yt_video_id,
                "title": v.title,
                "thumbnail_url": v.thumbnail_url,
                "published_at": v.published_at,
                "status": v.status,
            }
            for v in vids
        ],
    }


# ----------------------------
# Initial full sync for a channel (videos + per-video daily metrics)
# ----------------------------
@router.post("/sync/full")
async def sync_full(
    channel_id: int,
    days: int = 180,
    request: Request = ...,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = session.get(Channel, channel_id)
    if not c or c.user_id != user_id:
        raise HTTPException(status_code=404, detail="channel not found")

    try:
        token = await get_valid_access_token_for_channel(request, session, channel_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Discover videos via uploads playlist
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            ch_resp = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "contentDetails", "id": c.yt_channel_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        # If the cached access token is stale, refresh and retry once
        if ch_resp.status_code == 401:
            ga = session.get(GoogleAccount, c.google_account_id)
            if not ga:
                raise HTTPException(status_code=404, detail="google account not found for channel")
            token = await refresh_and_persist_access_token(request, session, ga)
            async with httpx.AsyncClient(timeout=20.0) as client:
                ch_resp = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "contentDetails", "id": c.yt_channel_id},
                    headers={"Authorization": f"Bearer {token}"},
                )
        ch_resp.raise_for_status()
        uploads = (
            ch_resp.json()["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
        )

        video_ids = []
        next_page = None
        from ..db.models import VideoMap
        while True:
            async with httpx.AsyncClient(timeout=20.0) as client:
                pl_resp = await client.get(
                    "https://www.googleapis.com/youtube/v3/playlistItems",
                    params={
                        "part": "contentDetails,snippet",
                        "playlistId": uploads,
                        "maxResults": 50,
                        **({"pageToken": next_page} if next_page else {}),
                    },
                    headers={"Authorization": f"Bearer {token}"},
                )
            # Handle stale access token during pagination as well
            if pl_resp.status_code == 401:
                ga = session.get(GoogleAccount, c.google_account_id)
                if not ga:
                    raise HTTPException(status_code=404, detail="google account not found for channel")
                token = await refresh_and_persist_access_token(request, session, ga)
                async with httpx.AsyncClient(timeout=20.0) as client:
                    pl_resp = await client.get(
                        "https://www.googleapis.com/youtube/v3/playlistItems",
                        params={
                            "part": "contentDetails,snippet",
                            "playlistId": uploads,
                            "maxResults": 50,
                            **({"pageToken": next_page} if next_page else {}),
                        },
                        headers={"Authorization": f"Bearer {token}"},
                    )
            pl_resp.raise_for_status()
            plj = pl_resp.json()
            for it in plj.get("items", []):
                vid = it["contentDetails"]["videoId"]
                title = it["snippet"].get("title")
                published_at = it["contentDetails"].get("videoPublishedAt")
                thumb = (
                    it["snippet"].get("thumbnails", {}).get("default", {}).get("url")
                )
                row = session.exec(
                    select(VideoMap).where(VideoMap.yt_video_id == vid, VideoMap.channel_id == c.id)
                ).first()
                if row:
                    if title:
                        row.title = title
                    row.thumbnail_url = thumb or row.thumbnail_url
                    if published_at:
                        try:
                            row.published_at = dt.datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                        except Exception:
                            pass
                else:
                    session.add(
                        VideoMap(
                            channel_id=c.id,
                            yt_video_id=vid,
                            title=title or "",
                            thumbnail_url=thumb,
                            published_at=(
                                dt.datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                                if published_at else None
                            ),
                        )
                    )
                video_ids.append(vid)
            session.commit()
            next_page = plj.get("nextPageToken")
            if not next_page:
                break
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"failed to list videos: {e}")

    # Per-video daily metrics
    end = dt.date.today()
    start = end - dt.timedelta(days=max(1, days) - 1)
    inserted = 0
    videos_with_metrics: set[str] = set()
    for vid in video_ids:
        params = {
            "ids": f"channel=={c.yt_channel_id}",
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "metrics": ",".join([
                "views",
                "estimatedMinutesWatched",
                "averageViewDuration",
                "averageViewPercentage",
                "impressions",
                "impressionsClickThroughRate",
                "likes",
                "subscribersGained",
                "subscribersLost",
                "estimatedRevenue",
            ]),
            "dimensions": "day",
            "filters": f"video=={vid}",
        }
        r = await _yt_analytics_get(request, token, params)
        if r.status_code == 401:
            ga = session.get(GoogleAccount, c.google_account_id)
            if not ga:
                raise HTTPException(status_code=404, detail="google account not found for channel")
            token = await refresh_and_persist_access_token(request, session, ga)
            r = await _yt_analytics_get(request, token, params)
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError:
            # Keep track of failures; we'll try a fallback using Data API stats later
            continue
        data = r.json()
        headers = [h["name"] for h in data.get("columnHeaders", [])]
        rows = data.get("rows", []) or []
        idx = {name: i for i, name in enumerate(headers)}
        def _get(row, name, default=None):
            i = idx.get(name)
            return row[i] if i is not None and i < len(row) else default
        for row in rows:
            day = dt.date.fromisoformat(_get(row, "day"))
            views = int(_get(row, "views", 0) or 0)
            emw = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)
            avgd = float(_get(row, "averageViewDuration", 0) or 0.0)
            avgp = float(_get(row, "averageViewPercentage", 0) or 0.0)
            impr = int(_get(row, "impressions", 0) or 0)
            ctr = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)
            likes = int(_get(row, "likes", 0) or 0)
            sg = int(_get(row, "subscribersGained", 0) or 0)
            sl = int(_get(row, "subscribersLost", 0) or 0)
            rev = float(_get(row, "estimatedRevenue", 0) or 0.0)

            session.exec(
                sa.text(
                    "DELETE FROM metricdaily WHERE channel_id = :cid AND video_id = :vid AND date = :d"
                ),
                {"cid": c.id, "vid": vid, "d": day},
            )
            session.add(MetricDaily(
                channel_id=c.id,
                video_id=vid,
                date=day,
                views=views,
                watch_time_min=int(round(emw)),
                avg_view_duration_sec=int(round(avgd)),
                avg_pct_viewed=avgp,
                impressions=impr,
                impressions_ctr_pct=ctr * 100.0,
                likes=likes,
                subs_gained=sg,
                subs_lost=sl,
                est_revenue_minor=int(round(rev * 100)),
            ))
            inserted += 1
            videos_with_metrics.add(vid)
        session.commit()

    # Fallback: for any videos that returned no Analytics rows (e.g., scope
    # issues), use YouTube Data API to fetch current statistics and store a
    # snapshot row for today so the dashboard shows non-zero totals.
    try:
        missing = [v for v in video_ids if v not in videos_with_metrics]
        if missing:
            batch = 50
            today = dt.date.today()
            for i in range(0, len(missing), batch):
                ids = ",".join(missing[i:i+batch])
                async with httpx.AsyncClient(timeout=20.0) as client:
                    stats_resp = await client.get(
                        "https://www.googleapis.com/youtube/v3/videos",
                        params={
                            "part": "statistics",
                            "id": ids,
                        },
                        headers={"Authorization": f"Bearer {token}"},
                    )
                if stats_resp.status_code == 401:
                    ga = session.get(GoogleAccount, c.google_account_id)
                    if ga:
                        token = await refresh_and_persist_access_token(request, session, ga)
                        async with httpx.AsyncClient(timeout=20.0) as client:
                            stats_resp = await client.get(
                                "https://www.googleapis.com/youtube/v3/videos",
                                params={
                                    "part": "statistics",
                                    "id": ids,
                                },
                                headers={"Authorization": f"Bearer {token}"},
                            )
                try:
                    stats_resp.raise_for_status()
                except httpx.HTTPStatusError:
                    continue
                stj = stats_resp.json()
                for item in stj.get("items", []):
                    vid = item.get("id")
                    st = item.get("statistics", {})
                    views = int(st.get("viewCount", 0) or 0)
                    likes = int(st.get("likeCount", 0) or 0)
                    # Upsert snapshot for today
                    session.exec(
                        sa.text(
                            "DELETE FROM metricdaily WHERE channel_id = :cid AND video_id = :vid AND date = :d"
                        ),
                        {"cid": c.id, "vid": vid, "d": today},
                    )
                    session.add(MetricDaily(
                        channel_id=c.id,
                        video_id=vid,
                        date=today,
                        views=views,
                        likes=likes,
                    ))
                    inserted += 1
            session.commit()
    except Exception:
        pass

    # Mark channel as synced now that full pass is done
    try:
        c.last_synced_at = dt.datetime.utcnow()
        session.add(c)
        session.commit()
    except Exception:
        # non-fatal; proceed
        pass

    # 3) Breakdowns (best-effort; ignore failures)
    try:
        brks = 0
        for vid in video_ids:
            for dim, metrics, key in [
                ("insightTrafficSourceType", ["views","estimatedMinutesWatched","impressions","impressionsClickThroughRate"], "insightTrafficSourceType"),
                ("deviceType", ["views","estimatedMinutesWatched"], "deviceType"),
                ("country", ["views","estimatedMinutesWatched"], "country"),
                ("ageGroup,gender", ["views","estimatedMinutesWatched"], "ageGroup"),
            ]:
                try:
                    brks += await _ingest_breakdown(request, session, c, vid, token, start, end, dim, metrics, key)
                except Exception:
                    continue
    except Exception:
        pass

    return {"ok": True, "videos": len(video_ids), "rows": inserted}


@router.post("/sync/auto")
async def sync_auto(
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    For each channel: if never synced or last sync > 8 hours ago, run a full sync (last 180 days).
    """
    # Reset manual refresh counter daily
    try:
        u = session.get(User, user_id)
        if u:
            today = dt.date.today()
            if getattr(u, "manual_refresh_date", None) != today:
                u.manual_refresh_date = today
                u.manual_refresh_count = 0
                session.add(u)
                session.commit()
    except Exception:
        pass

    channels = session.exec(select(Channel).where(Channel.user_id == user_id, Channel.active == True)).all()
    ran = 0
    errors: list[dict] = []
    for c in channels:
        if not c.last_synced_at or (dt.datetime.utcnow() - c.last_synced_at).total_seconds() > 8 * 3600:
            try:
                await sync_full(channel_id=c.id, days=180, request=request, user_id=user_id, session=session)  # type: ignore
                ran += 1
            except Exception as e:
                errors.append({"channel_id": c.id, "error": str(e)})
                continue
    return {"ok": True, "synced": ran, "total": len(channels), "errors": errors}


@router.post("/sync/manual")
async def sync_manual(
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """
    Force refresh across all channels, limited to 3 times per day per user.
    """
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    today = dt.date.today()
    if u.manual_refresh_date != today:
        u.manual_refresh_date = today
        u.manual_refresh_count = 0
    if u.manual_refresh_count >= 3:
        raise HTTPException(status_code=429, detail="manual refresh limit reached for today")

    u.manual_refresh_count += 1
    session.add(u)
    session.commit()

    channels = session.exec(select(Channel).where(Channel.user_id == user_id, Channel.active == True)).all()
    errs: list[dict] = []
    ok_count = 0
    for c in channels:
        try:
            await sync_full(channel_id=c.id, days=180, request=request, user_id=user_id, session=session)  # type: ignore
            ok_count += 1
        except Exception as e:
            errs.append({"channel_id": c.id, "error": str(e)})
    remaining = 3 - u.manual_refresh_count
    return {"ok": True, "refreshed_channels": ok_count, "remaining_today": max(0, remaining), "errors": errs}


# ----------------------------
# Aggregate per-video totals across all days
# ----------------------------
@router.get("/videos/summary")
def videos_summary(
    channel_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = session.get(Channel, channel_id)
    if not c or c.user_id != user_id:
        raise HTTPException(status_code=404, detail="channel not found")
    stmt = sa.text(
        """
        SELECT v.id as vm_id, v.yt_video_id, v.title, v.thumbnail_url,
               SUM(m.views) as views,
               SUM(m.watch_time_min) as watch_time_min,
               SUM(COALESCE(m.subs_gained,0) - COALESCE(m.subs_lost,0)) as subs_net,
               SUM(COALESCE(m.est_revenue_minor,0)) as revenue_minor,
               SUM(COALESCE(m.impressions,0)) as impressions,
               AVG(COALESCE(m.impressions_ctr_pct,0)) as ctr_pct,
               AVG(COALESCE(m.avg_view_duration_sec,0)) as avg_view_duration_sec,
               AVG(COALESCE(m.avg_pct_viewed,0)) as avg_pct_viewed
        FROM videomap v
        LEFT JOIN metricdaily m ON m.channel_id = v.channel_id AND m.video_id = v.yt_video_id
        WHERE v.channel_id = :cid
        GROUP BY v.id, v.yt_video_id, v.title, v.thumbnail_url
        ORDER BY views DESC
        """
    ).bindparams(sa.bindparam("cid", value=c.id))
    q = session.exec(stmt).all()
    rows = [dict(r._mapping) for r in q]
    return {"ok": True, "videos": rows}


# ----------------------------
# Time series for charts
# ----------------------------
@router.get("/channel/timeseries")
def channel_timeseries(
    channel_id: int | None = None,
    days: int = 28,
    all: bool = False,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    end = dt.date.today()
    start = end - dt.timedelta(days=max(1, days) - 1)
    if all:
        chan_ids = [c.id for c in session.exec(select(Channel.id).where(Channel.user_id == user_id, Channel.active == True)).all()]
        if not chan_ids:
            return {"ok": True, "series": []}
        stmt = sa.text(
            """
            SELECT date, SUM(views) as views, SUM(watch_time_min) as watch_time_min
            FROM metricdaily
            WHERE channel_id IN (:ids) AND date BETWEEN :start AND :end
            GROUP BY date
            ORDER BY date
            """
        )
        # SQLite doesn't support IN (:ids) with array bind in text; build dynamic
        placeholders = ",".join([f":id{i}" for i in range(len(chan_ids))])
        stmt = sa.text(
            f"SELECT date, SUM(views) as views, SUM(watch_time_min) as watch_time_min "
            f"FROM metricdaily WHERE channel_id IN ({placeholders}) AND date BETWEEN :start AND :end "
            f"GROUP BY date ORDER BY date"
        ).bindparams(**{f"id{i}": cid for i, cid in enumerate(chan_ids)}, start=start, end=end)
        rows = session.exec(stmt).all()
    else:
        if channel_id is None:
            raise HTTPException(status_code=400, detail="channel_id required when all=false")
        c = session.get(Channel, channel_id)
        if not c or c.user_id != user_id:
            raise HTTPException(status_code=404, detail="channel not found")
        stmt = sa.text(
            """
            SELECT date, SUM(views) as views, SUM(watch_time_min) as watch_time_min
            FROM metricdaily
            WHERE channel_id = :cid AND date BETWEEN :start AND :end
            GROUP BY date
            ORDER BY date
            """
        ).bindparams(cid=c.id, start=start, end=end)
        rows = session.exec(stmt).all()
    return {"ok": True, "series": [dict(r._mapping) for r in rows]}


@router.get("/video/timeseries")
def video_timeseries(
    channel_id: int,
    yt_video_id: str,
    days: int = 28,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    c = session.get(Channel, channel_id)
    if not c or c.user_id != user_id:
        raise HTTPException(status_code=404, detail="channel not found")
    end = dt.date.today()
    start = end - dt.timedelta(days=max(1, days) - 1)
    stmt = sa.text(
        """
        SELECT date, views, watch_time_min, impressions, impressions_ctr_pct, avg_view_duration_sec, avg_pct_viewed
        FROM metricdaily
        WHERE channel_id = :cid AND video_id = :vid AND date BETWEEN :start AND :end
        ORDER BY date
        """
    ).bindparams(cid=c.id, vid=yt_video_id, start=start, end=end)
    rows = session.exec(stmt).all()
    return {"ok": True, "series": [dict(r._mapping) for r in rows]}
