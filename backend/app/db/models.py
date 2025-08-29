# app/db/models.py
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlmodel import SQLModel, Field
from app.core.crypto import encrypt_str, decrypt_str  # uses your existing crypto


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
    """
    One row per Google identity the user links.
    We store tokens encrypted only (Fernet via JWT_SECRET).
    """
    id: Optional[int] = Field(default=None, primary_key=True)

    # Link to local user
    user_id: int = Field(index=True, foreign_key="user.id")

    # helpful identity info
    email: Optional[str] = Field(default=None, index=True)
    sub: Optional[str] = None  # OIDC subject
    scopes_json: Optional[str] = None

    # token storage (encrypted only)
    refresh_token_enc: Optional[str] = None
    access_token_enc: Optional[str] = None
    id_token: Optional[str] = None  # kept for compatibility with callers

    status: str = "ok"  # ok | needs_reauth | revoked
    token_updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    # ---- Back-compat alias: legacy code can use ga.refresh_token
    #      This returns the DECRYPTED value and writes an encrypted value.
    @property
    def refresh_token(self) -> Optional[str]:
        if not self.refresh_token_enc:
            return None
        try:
            return decrypt_str(self.refresh_token_enc)
        except Exception:
            return None

    @refresh_token.setter
    def refresh_token(self, value: Optional[str]) -> None:
        self.refresh_token_enc = encrypt_str(value) if value else None


# -----------------------
# Channels
# -----------------------
class Channel(SQLModel, table=True):
    """
    Channels are discovered for each GoogleAccount after OAuth.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    google_account_id: int = Field(index=True, foreign_key="googleaccount.id")

    yt_channel_id: str = Field(index=True)  # keep index; avoid unique for compatibility
    title: str
    thumbnail_url: Optional[str] = None
    default_currency: Optional[str] = None
    active: bool = True

    # sync cursoring
    first_seen_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    last_synced_at: Optional[dt.datetime] = None  # analytics last full sync
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)


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


# -----------------------
# Daily metrics (channel or video)
# -----------------------
class MetricDaily(SQLModel, table=True):
    """
    Wide, fast table for daily channel/video metrics.
    Add columns as you need them; defaults keep inserts simple.
    """
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
    likes: Optional[int] = None
    subs_gained: Optional[int] = None
    subs_lost: Optional[int] = None
    est_revenue_minor: Optional[int] = None
    rpm_minor: Optional[int] = None
    playback_cpm_minor: Optional[int] = None
    currency: Optional[str] = None
