# backend/app/api/youtube.py
from __future__ import annotations

import datetime as dt
import httpx
import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from typing import Optional

from app.api.deps import require_user_id
from ..db.core import get_session
from ..db.models import (
    User,
    Platform,
    PlatformAccount,
    OAuthCredential,
    Channel,
    UserChannel,
    Video,
    ChannelDailyMetrics,
    VideoDailyMetrics,
)
from ..services.token_helper import (
    get_valid_access_token,
    get_valid_access_token_for_channel,
)

router = APIRouter()

# ----------------------------
# helpers
# ----------------------------

def _user_channel(session: Session, user_id: int, channel_id: int) -> Optional[Channel]:
    """Return the Channel if the user is linked to it, else None."""
    return session.exec(
        select(Channel)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(UserChannel.user_id == user_id, Channel.id == channel_id, Channel.is_active == True)
    ).first()

async def _yt_analytics_get(request, token: str, params: dict):
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.get(
            "https://youtubeanalytics.googleapis.com/v2/reports",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

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
                "last_synced_at": c.last_synced_at,
            }
            for c in chans
        ],
    }

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

    # 8-hour guard
    if c.last_synced_at and (dt.datetime.utcnow() - c.last_synced_at).total_seconds() < 8 * 3600:
        return {"ok": True, "skipped": True, "reason": "recently synced"}

    try:
        token = await get_valid_access_token_for_channel(request, session, channel_id)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))

    end = dt.date.today()
    start = end - dt.timedelta(days=max(1, days) - 1)

    params = {
        "ids": f"channel=={c.external_channel_id}",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "metrics": ",".join([
            "views",
            "estimatedMinutesWatched",
            "impressions",
            "impressionsClickThroughRate",
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

        session.exec(
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

    c.last_synced_at = dt.datetime.utcnow()
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

    # Discover videos via uploads playlist
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            ch_resp = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "contentDetails", "id": c.external_channel_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        if ch_resp.status_code == 401:
            token = await get_valid_access_token_for_channel(request, session, channel_id)
            async with httpx.AsyncClient(timeout=20.0) as client:
                ch_resp = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "contentDetails", "id": c.external_channel_id},
                    headers={"Authorization": f"Bearer {token}"},
                )
        ch_resp.raise_for_status()
        uploads = ch_resp.json()["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

        video_ids_external: list[str] = []
        next_page: Optional[str] = None
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
            if pl_resp.status_code == 401:
                token = await get_valid_access_token_for_channel(request, session, channel_id)
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
                vid_ext = it["contentDetails"]["videoId"]
                snippet = it.get("snippet", {}) or {}
                title = snippet.get("title")
                published_at = it["contentDetails"].get("videoPublishedAt")
                thumb = snippet.get("thumbnails", {}).get("default", {}).get("url")

                # Upsert Video by (platform_id, external_video_id)
                v = session.exec(
                    select(Video).where(
                        Video.platform_id == c.platform_id,
                        Video.external_video_id == vid_ext,
                    )
                ).first()
                if v:
                    if title:
                        v.title = title
                    v.thumbnail_url = thumb or v.thumbnail_url
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
                session.commit()
                video_ids_external.append(vid_ext)
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

    for vid_ext in video_ids_external:
        params = {
            "ids": f"channel=={c.external_channel_id}",
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
                "comments",
                "shares",
                "subscribersGained",
                "estimatedRevenue",
            ]),
            "dimensions": "day",
            "filters": f"video=={vid_ext}",
        }
        r = await _yt_analytics_get(request, token, params)
        if r.status_code == 401:
            token = await get_valid_access_token_for_channel(request, session, channel_id)
            r = await _yt_analytics_get(request, token, params)
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError:
            # fallback later with Data API
            continue

        data = r.json()
        headers = [h["name"] for h in data.get("columnHeaders", [])]
        rows = data.get("rows", []) or []
        idx = {name: i for i, name in enumerate(headers)}

        def _get(row, name, default=None):
            i = idx.get(name)
            return row[i] if i is not None and i < len(row) else default

        v = session.exec(
            select(Video).where(
                Video.platform_id == c.platform_id,
                Video.external_video_id == vid_ext,
            )
        ).first()
        if not v:
            continue

        for row in rows:
            day = dt.date.fromisoformat(_get(row, "day"))
            emw = float(_get(row, "estimatedMinutesWatched", 0) or 0.0)
            avgd = float(_get(row, "averageViewDuration", 0) or 0.0)
            avgp = float(_get(row, "averageViewPercentage", 0) or 0.0)
            impr = int(_get(row, "impressions", 0) or 0)
            ctr0_1 = float(_get(row, "impressionsClickThroughRate", 0) or 0.0)
            likes = int(_get(row, "likes", 0) or 0)
            comments = int(_get(row, "comments", 0) or 0)
            shares = int(_get(row, "shares", 0) or 0)
            sg_vid = int(_get(row, "subscribersGained", 0) or 0)
            views = int(_get(row, "views", 0) or 0)
            rev = float(_get(row, "estimatedRevenue", 0) or 0.0)

            session.exec(
                sa.text(
                    "DELETE FROM video_daily_metrics WHERE video_id = :vid AND date = :d"
                ),
                {"vid": v.id, "d": day},
            )
            session.add(VideoDailyMetrics(
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
            ))
            inserted += 1
            videos_with_metrics.add(vid_ext)
        session.commit()

    # Fallback snapshot for videos with no Analytics rows
    try:
        missing = [v for v in video_ids_external if v not in videos_with_metrics]
        if missing:
            batch = 50
            today = dt.date.today()
            for i in range(0, len(missing), batch):
                ids = ",".join(missing[i:i+batch])
                async with httpx.AsyncClient(timeout=20.0) as client:
                    stats_resp = await client.get(
                        "https://www.googleapis.com/youtube/v3/videos",
                        params={"part": "statistics", "id": ids},
                        headers={"Authorization": f"Bearer {token}"},
                    )
                if stats_resp.status_code == 401:
                    token = await get_valid_access_token_for_channel(request, session, channel_id)
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        stats_resp = await client.get(
                            "https://www.googleapis.com/youtube/v3/videos",
                            params={"part": "statistics", "id": ids},
                            headers={"Authorization": f"Bearer {token}"},
                        )
                try:
                    stats_resp.raise_for_status()
                except httpx.HTTPStatusError:
                    continue
                stj = stats_resp.json()
                for item in stj.get("items", []):
                    vid_ext = item.get("id")
                    st = item.get("statistics", {})
                    views = int(st.get("viewCount", 0) or 0)
                    likes = int(st.get("likeCount", 0) or 0)

                    v = session.exec(
                        select(Video).where(
                            Video.platform_id == c.platform_id,
                            Video.external_video_id == vid_ext,
                        )
                    ).first()
                    if not v:
                        continue

                    session.exec(
                        sa.text(
                            "DELETE FROM video_daily_metrics WHERE video_id = :vid AND date = :d"
                        ),
                        {"vid": v.id, "d": today},
                    )
                    session.add(VideoDailyMetrics(
                        video_id=v.id,
                        date=today,
                        views=views,
                        likes=likes,
                    ))
                    inserted += 1
            session.commit()
    except Exception:
        pass

    # Mark channel as synced
    try:
        c.last_synced_at = dt.datetime.utcnow()
        session.add(c)
        session.commit()
    except Exception:
        pass

    return {"ok": True, "videos": len(video_ids_external), "rows": inserted}

# ----------------------------
# Auto sync (8-hour cadence)
# ----------------------------
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
        if not c.last_synced_at or (dt.datetime.utcnow() - c.last_synced_at).total_seconds() > 8 * 3600:
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
               SUM(m.views) as views,
               SUM(m.watch_time_minutes) as watch_time_minutes,
               SUM(COALESCE(m.subs_gained_from_video,0)) as subs_gained_from_video,
               SUM(COALESCE(m.estimated_revenue,0)) as estimated_revenue,
               SUM(COALESCE(m.impressions,0)) as impressions,
               AVG(COALESCE(m.click_through_rate,0)) as click_through_rate,
               AVG(COALESCE(m.avg_view_duration_seconds,0)) as avg_view_duration_seconds,
               AVG(COALESCE(m.avg_percent_viewed,0)) as avg_percent_viewed
        FROM video v
        LEFT JOIN video_daily_metrics m ON m.video_id = v.id
        WHERE v.channel_id = :cid AND v.is_active = 1
        GROUP BY v.id, v.external_video_id, v.title, v.thumbnail_url
        ORDER BY views DESC
        """
    ).bindparams(sa.bindparam("cid", value=c.id))
    q = session.exec(stmt).all()
    rows = [dict(r._mapping) for r in q]
    return {"ok": True, "videos": rows}

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
    end = dt.date.today()
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
            SELECT date, SUM(views) as views, SUM(watch_time_minutes) as watch_time_minutes
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
            SELECT date, views, watch_time_minutes
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

    end = dt.date.today()
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
