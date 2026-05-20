"""Content Groups CRUD.

A ContentGroup ties together videos representing the *same content* posted
across one or more channels (initially just YouTube; later also IG/TikTok).
This is the cross-platform comparison wedge.
"""
from __future__ import annotations

import datetime as dt

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db.core import get_session
from ..db.models import (
    Channel,
    ContentGroup,
    ContentGroupItem,
    UserChannel,
    Video,
)
from .deps import require_user_id

router = APIRouter(prefix="/content-groups", tags=["content-groups"])


# ---------- schemas ----------

class GroupCreate(BaseModel):
    name: str
    description: str | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GroupItemAdd(BaseModel):
    video_id: int
    note: str | None = None


# ---------- helpers ----------

def _own_group_or_404(session: Session, user_id: int, group_id: int) -> ContentGroup:
    g = session.get(ContentGroup, group_id)
    if not g or g.user_id != user_id:
        raise HTTPException(status_code=404, detail="group not found")
    return g


def _user_owns_video(session: Session, user_id: int, video_id: int) -> bool:
    """A user owns a video iff they own the channel it belongs to."""
    row = session.exec(
        select(Video.id)
        .join(Channel, Channel.id == Video.channel_id)
        .join(UserChannel, UserChannel.channel_id == Channel.id)
        .where(Video.id == video_id, UserChannel.user_id == user_id)
    ).first()
    return row is not None


# ---------- endpoints ----------

@router.get("")
def list_groups(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(ContentGroup)
        .where(ContentGroup.user_id == user_id)
        .order_by(sa.desc(ContentGroup.created_at))
    ).all()
    # Item counts and aggregate lifetime views per group
    counts: dict[int, int] = {}
    group_views: dict[int, int] = {}
    if rows:
        ids = [g.id for g in rows]
        count_result = session.exec(
            sa.select(
                ContentGroupItem.content_group_id,
                sa.func.count(ContentGroupItem.id),
            )
            .where(ContentGroupItem.content_group_id.in_(ids))
            .group_by(ContentGroupItem.content_group_id)
        ).all()
        for gid, c in count_result:
            counts[gid] = int(c)

        # Lifetime views summed across all videos in each group
        views_result = session.exec(
            sa.text(
                """
                SELECT cgi.content_group_id,
                       COALESCE(SUM(m.views), 0) AS total_views
                FROM content_group_item cgi
                JOIN video v ON v.id = cgi.video_id
                LEFT JOIN video_daily_metrics m ON m.video_id = v.id
                WHERE cgi.content_group_id IN :ids
                GROUP BY cgi.content_group_id
                """
            ).bindparams(sa.bindparam("ids", expanding=True)),
            {"ids": ids},
        ).all()
        for gid, v in views_result:
            group_views[gid] = int(v)

    return {
        "ok": True,
        "groups": [
            {
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "item_count": counts.get(g.id, 0),
                "total_views": group_views.get(g.id, 0),
                "created_at": g.created_at,
                "updated_at": g.updated_at,
            }
            for g in rows
        ],
    }


@router.post("", status_code=201)
def create_group(
    body: GroupCreate,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    g = ContentGroup(user_id=user_id, name=name, description=body.description)
    session.add(g)
    session.commit()
    session.refresh(g)
    return {"ok": True, "group": {"id": g.id, "name": g.name, "description": g.description}}


@router.patch("/{group_id}")
def update_group(
    group_id: int,
    body: GroupUpdate,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    g = _own_group_or_404(session, user_id, group_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        g.name = name
    if body.description is not None:
        g.description = body.description or None
    session.add(g)
    session.commit()
    session.refresh(g)
    return {"ok": True, "group": {"id": g.id, "name": g.name, "description": g.description}}


@router.get("/{group_id}")
def get_group(
    group_id: int,
    days: int = 0,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    """Return group with per-video metrics.

    days=0 (default) → lifetime totals.
    days=N → metrics for the last N days; lifetime_views is always included.
    """
    g = _own_group_or_404(session, user_id, group_id)

    # Always fetch lifetime totals + video/channel metadata
    lifetime_stmt = sa.text(
        """
        SELECT
            i.id               AS item_id,
            i.note             AS note,
            v.id               AS video_id,
            v.external_video_id,
            v.title,
            v.thumbnail_url,
            v.duration_seconds,
            v.published_at,
            v.channel_id,
            c.title            AS channel_title,
            c.avatar_url       AS channel_avatar_url,
            c.subscriber_count AS subscriber_count,
            COALESCE(SUM(m.views), 0)               AS lifetime_views,
            COALESCE(SUM(m.watch_time_minutes), 0)  AS lifetime_watch_time_minutes,
            COALESCE(SUM(m.likes), 0)               AS lifetime_likes,
            COALESCE(SUM(m.comments), 0)            AS lifetime_comments,
            COALESCE(SUM(m.shares), 0)              AS lifetime_shares,
            COALESCE(SUM(m.impressions), 0)         AS lifetime_impressions
        FROM content_group_item i
        JOIN video v ON v.id = i.video_id
        JOIN channel c ON c.id = v.channel_id
        LEFT JOIN video_daily_metrics m ON m.video_id = v.id
        WHERE i.content_group_id = :gid
        GROUP BY i.id, i.note, v.id, v.external_video_id, v.title, v.thumbnail_url,
                 v.duration_seconds, v.published_at, v.channel_id,
                 c.title, c.avatar_url, c.subscriber_count
        ORDER BY lifetime_views DESC
        """
    ).bindparams(gid=group_id)
    items: list[dict] = [dict(r._mapping) for r in session.exec(lifetime_stmt).all()]

    if days > 0:
        # Second query: period-windowed metrics
        end = dt.datetime.now(dt.UTC).date()
        start = end - dt.timedelta(days=days - 1)
        period_stmt = sa.text(
            """
            SELECT
                i.id                                   AS item_id,
                COALESCE(SUM(m.views), 0)              AS views,
                COALESCE(SUM(m.watch_time_minutes), 0) AS watch_time_minutes,
                COALESCE(SUM(m.likes), 0)              AS likes,
                COALESCE(SUM(m.comments), 0)           AS comments,
                COALESCE(SUM(m.shares), 0)             AS shares
            FROM content_group_item i
            JOIN video v ON v.id = i.video_id
            LEFT JOIN video_daily_metrics m
                   ON m.video_id = v.id AND m.date BETWEEN :start AND :end
            WHERE i.content_group_id = :gid
            GROUP BY i.id
            """
        ).bindparams(gid=group_id, start=start, end=end)
        period_by_item = {
            d["item_id"]: d
            for d in (dict(r._mapping) for r in session.exec(period_stmt).all())
        }
        for item in items:
            pd = period_by_item.get(item["item_id"], {})
            item["views"] = int(pd.get("views", 0))
            item["watch_time_minutes"] = int(pd.get("watch_time_minutes", 0))
            item["likes"] = int(pd.get("likes", 0))
            item["comments"] = int(pd.get("comments", 0))
            item["shares"] = int(pd.get("shares", 0))
    else:
        # Lifetime: alias lifetime_* to the primary metric keys
        for item in items:
            item["views"] = item["lifetime_views"]
            item["watch_time_minutes"] = item["lifetime_watch_time_minutes"]
            item["likes"] = item["lifetime_likes"]
            item["comments"] = item["lifetime_comments"]
            item["shares"] = item["lifetime_shares"]

    return {
        "ok": True,
        "days": days,
        "group": {
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
        },
        "items": items,
    }


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    g = _own_group_or_404(session, user_id, group_id)
    session.delete(g)
    session.commit()
    return None


@router.post("/{group_id}/items", status_code=201)
def add_item(
    group_id: int,
    body: GroupItemAdd,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    _own_group_or_404(session, user_id, group_id)
    if not _user_owns_video(session, user_id, body.video_id):
        raise HTTPException(status_code=404, detail="video not found")
    # Idempotent: ignore duplicate (uq_content_group_video)
    existing = session.exec(
        select(ContentGroupItem).where(
            ContentGroupItem.content_group_id == group_id,
            ContentGroupItem.video_id == body.video_id,
        )
    ).first()
    if existing:
        return {"ok": True, "item": {"id": existing.id, "video_id": existing.video_id}}
    it = ContentGroupItem(
        content_group_id=group_id,
        video_id=body.video_id,
        note=body.note,
    )
    session.add(it)
    session.commit()
    session.refresh(it)
    return {"ok": True, "item": {"id": it.id, "video_id": it.video_id}}


@router.delete("/{group_id}/items/{item_id}", status_code=204)
def remove_item(
    group_id: int,
    item_id: int,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    _own_group_or_404(session, user_id, group_id)
    it = session.get(ContentGroupItem, item_id)
    if not it or it.content_group_id != group_id:
        raise HTTPException(status_code=404, detail="item not found")
    session.delete(it)
    session.commit()
    return None
