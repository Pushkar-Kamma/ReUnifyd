# app/db/models.py
from __future__ import annotations

import datetime as dt
from typing import Optional
from sqlmodel import SQLModel, Field


# -----------------------
# Users
# -----------------------
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)


# -----------------------
# Google OAuth account
# -----------------------
class GoogleAccount(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    # Link to local user
    user_id: int = Field(index=True, foreign_key="user.id")

    # NEW/RELAXED FIELDS (all optional so first save never fails)
    email: Optional[str] = Field(default=None, index=True)
    refresh_token_enc: Optional[str] = None          # was NOT NULL before
    access_token: Optional[str] = None
    id_token: Optional[str] = None
    scopes_json: Optional[str] = None                # was required before

    status: str = "ok"                               # ok | needs_reauth | revoked
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    # ---- Property alias so the rest of your app can use `ga.refresh_token`
    @property
    def refresh_token(self) -> Optional[str]:
        return self.refresh_token_enc

    @refresh_token.setter
    def refresh_token(self, value: Optional[str]) -> None:
        self.refresh_token_enc = value


# -----------------------
# Channels
# -----------------------
class Channel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    google_account_id: int = Field(index=True, foreign_key="googleaccount.id")

    yt_channel_id: str = Field(index=True)
    title: str
    thumbnail_url: Optional[str] = None
    default_currency: Optional[str] = None
    active: bool = True

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)


# -----------------------
# Daily metrics (channel or video)
# -----------------------
class MetricDaily(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(index=True, foreign_key="channel.id")
    # null video_id => channel-level row
    video_id: Optional[str] = Field(default=None, index=True)

    # keep name 'date', but use dt.date type
    date: dt.date = Field(index=True)

    # core metrics
    views: int = 0
    watch_time_min: int = 0
    avg_view_duration_sec: Optional[int] = None
    avg_pct_viewed: Optional[float] = None
    impressions: Optional[int] = None
    impressions_ctr_pct: Optional[float] = None
    subs_gained: Optional[int] = None
    subs_lost: Optional[int] = None
    est_revenue_minor: Optional[int] = None
    rpm_minor: Optional[int] = None
    playback_cpm_minor: Optional[int] = None
    currency: Optional[str] = None


# -----------------------
# Video map
# -----------------------
class VideoMap(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(index=True, foreign_key="channel.id")
    yt_video_id: str = Field(index=True)
    title: str
    published_at: Optional[dt.datetime] = None
    status: str = "active"  # active | private | deleted
