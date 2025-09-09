from __future__ import annotations

import os
import datetime as dt
from typing import Optional

from sqlmodel import SQLModel, Field
from sqlalchemy import (
    Column,
    UniqueConstraint,
    CheckConstraint,
    Index,
    ForeignKey,
    text,
)
from sqlalchemy import Enum as SAEnum  # portable Enum
from sqlalchemy.types import BigInteger, JSON
from sqlalchemy.dialects.postgresql import TIMESTAMP, NUMERIC, JSONB, VARCHAR, CHAR

# ------------------------------------------------------------------
# Cross-DB helpers
# ------------------------------------------------------------------
IS_POSTGRES = os.getenv("DATABASE_URL", "").startswith("postgresql")
JSONType = JSONB if IS_POSTGRES else JSON

def PG_ONLY(x):
    """Return x on Postgres, else None (we filter None in __table_args__)."""
    return x if IS_POSTGRES else None


# -----------------------
# Users
# -----------------------
class User(SQLModel, table=True):
    __tablename__ = "user"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: Optional[str] = None
    email: str = Field(index=True, unique=True, nullable=False)
    password_hash: Optional[str] = None

    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )
    updated_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
            server_onupdate=text("CURRENT_TIMESTAMP"),
        )
    )


# -----------------------
# Platforms
# -----------------------
class Platform(SQLModel, table=True):
    __tablename__ = "platform"

    id: Optional[int] = Field(default=None, primary_key=True)
    # Add new values via migrations when you expand
    name: str = Field(
        sa_column=Column(
            SAEnum(
                "youtube",
                "tiktok",
                "instagram",
                "x",
                "facebook",
                "twitch",
                name="platform_name_enum",
                native_enum=IS_POSTGRES,
            ),
            nullable=False,
        )
    )
    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )


# -----------------------
# Connected accounts & OAuth
# -----------------------
class PlatformAccount(SQLModel, table=True):
    __tablename__ = "platform_account"

    id: Optional[int] = Field(default=None, primary_key=True)
    platform_id: int = Field(
        sa_column=Column(
            ForeignKey("platform.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    # The app user who connected this account (others may still be granted access to channels)
    owner_user_id: int = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    display_name: Optional[str] = None

    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )


class OAuthCredential(SQLModel, table=True):
    __tablename__ = "oauth_credential"

    id: Optional[int] = Field(default=None, primary_key=True)
    platform_account_id: int = Field(
        sa_column=Column(
            ForeignKey("platform_account.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Store encrypted at rest (handled in app layer / KMS)
    access_token_encrypted: str = Field(nullable=False)
    refresh_token_encrypted: Optional[str] = None
    scopes: Optional[str] = Field(sa_column=Column(VARCHAR(1024)))
    expires_at: Optional[dt.datetime] = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True)
    )
    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )


# -----------------------
# Channels
# -----------------------
class Channel(SQLModel, table=True):
    __tablename__ = "channel"

    id: Optional[int] = Field(default=None, primary_key=True)

    platform_id: int = Field(
        sa_column=Column(ForeignKey("platform.id", ondelete="RESTRICT"), nullable=False)
    )
    platform_account_id: Optional[int] = Field(
        sa_column=Column(
            ForeignKey("platform_account.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    external_channel_id: str = Field(nullable=False)  # e.g., YouTube channelId

    title: Optional[str] = None
    description: Optional[str] = None
    country: Optional[str] = Field(default=None, sa_column=Column(CHAR(2)))  # ISO-3166-1
    language: Optional[str] = Field(default=None, sa_column=Column(CHAR(2)))  # ISO-639-1
    custom_url: Optional[str] = None
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    is_monetized: Optional[bool] = None
    published_at: Optional[dt.datetime] = Field(
        sa_column=Column(TIMESTAMP(timezone=True))
    )

    last_synced_at: Optional[dt.datetime] = Field(
        sa_column=Column(TIMESTAMP(timezone=True))
    )
    is_active: bool = Field(default=True, nullable=False)

    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )
    updated_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
            server_onupdate=text("CURRENT_TIMESTAMP"),
        )
    )

    __table_args__ = tuple(
        filter(
            None,
            (
                UniqueConstraint(
                    "platform_id", "external_channel_id", name="uq_platform_channel"
                ),
                Index("ix_channel_account", "platform_account_id"),
            ),
        )
    )


# -----------------------
# User ↔ Channel mapping (RBAC)
# -----------------------
class UserChannel(SQLModel, table=True):
    __tablename__ = "user_channel"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    channel_id: int = Field(
        sa_column=Column(
            ForeignKey("channel.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    role: str = Field(
        sa_column=Column(
            SAEnum("owner", "editor", "viewer", name="channel_role_enum", native_enum=IS_POSTGRES),
            nullable=False,
            server_default="viewer",
        )
    )
    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )

    __table_args__ = (UniqueConstraint("user_id", "channel_id", name="uq_user_channel_pair"),)


# -----------------------
# Videos / Content
# -----------------------
class Video(SQLModel, table=True):
    __tablename__ = "video"

    id: Optional[int] = Field(default=None, primary_key=True)

    platform_id: int = Field(
        sa_column=Column(ForeignKey("platform.id", ondelete="RESTRICT"), nullable=False)
    )
    channel_id: int = Field(
        sa_column=Column(ForeignKey("channel.id", ondelete="CASCADE"), nullable=False)
    )

    # platform-scoped unique
    external_video_id: str = Field(nullable=False)

    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    privacy_status: Optional[str] = Field(
        sa_column=Column(
            SAEnum("public", "unlisted", "private", name="privacy_enum", native_enum=IS_POSTGRES)
        )
    )
    content_type: Optional[str] = Field(
        sa_column=Column(
            SAEnum("video", "short", "reel", "live", "post", name="content_type_enum", native_enum=IS_POSTGRES)
        )
    )
    duration_seconds: Optional[int] = Field(sa_column=Column(BigInteger))
    published_at: Optional[dt.datetime] = Field(
        sa_column=Column(TIMESTAMP(timezone=True))
    )
    thumbnail_url: Optional[str] = None
    # array-of-strings or map; flexible & indexable with GIN (PG only)
    tags: Optional[dict] = Field(default=None, sa_column=Column(JSONType))

    last_synced_at: Optional[dt.datetime] = Field(
        sa_column=Column(TIMESTAMP(timezone=True))
    )
    is_active: bool = Field(default=True, nullable=False)

    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )
    updated_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
            server_onupdate=text("CURRENT_TIMESTAMP"),
        )
    )

    __table_args__ = tuple(
        filter(
            None,
            (
                UniqueConstraint("platform_id", "external_video_id", name="uq_platform_video"),
                Index("ix_video_channel_published", "channel_id", "published_at"),
                PG_ONLY(Index("ix_video_tags_gin", "tags", postgresql_using="gin")),
            ),
        )
    )


# ===========================================================
#                  DAILY ROLLUPS (per-day)
#   Natural composite PKs for safe upserts.
#   Counts are BIGINT; money is NUMERIC with currency code.
# ===========================================================
class ChannelDailyMetrics(SQLModel, table=True):
    __tablename__ = "channel_daily_metrics"

    channel_id: int = Field(
        sa_column=Column(
            ForeignKey("channel.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    date: dt.date = Field(primary_key=True)

    subscribers_total: Optional[int] = Field(sa_column=Column(BigInteger))
    subscribers_gained: Optional[int] = Field(sa_column=Column(BigInteger))
    subscribers_lost: Optional[int] = Field(sa_column=Column(BigInteger))
    views: Optional[int] = Field(sa_column=Column(BigInteger))
    watch_time_minutes: Optional[int] = Field(sa_column=Column(BigInteger))
    impressions: Optional[int] = Field(sa_column=Column(BigInteger))
    click_through_rate: Optional[float] = Field(sa_column=Column(NUMERIC(5, 2)))  # percent (e.g., 4.37)
    estimated_revenue: Optional[float] = Field(sa_column=Column(NUMERIC(12, 4)))
    revenue_currency: Optional[str] = Field(default="USD", sa_column=Column(CHAR(3)))

    __table_args__ = (
        CheckConstraint("subscribers_total >= 0", name="ck_cdm_subs_total_nonneg"),
        CheckConstraint("subscribers_gained >= 0", name="ck_cdm_subs_gained_nonneg"),
        CheckConstraint("subscribers_lost >= 0", name="ck_cdm_subs_lost_nonneg"),
        CheckConstraint("views >= 0", name="ck_cdm_views_nonneg"),
        CheckConstraint("watch_time_minutes >= 0", name="ck_cdm_wtm_nonneg"),
        CheckConstraint("impressions >= 0", name="ck_cdm_impr_nonneg"),
        CheckConstraint("click_through_rate >= 0 AND click_through_rate <= 100", name="ck_cdm_ctr_pct"),
        CheckConstraint("estimated_revenue >= 0", name="ck_cdm_rev_nonneg"),
    )


class VideoDailyMetrics(SQLModel, table=True):
    __tablename__ = "video_daily_metrics"

    video_id: int = Field(
        sa_column=Column(
            ForeignKey("video.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    date: dt.date = Field(primary_key=True)

    views: Optional[int] = Field(sa_column=Column(BigInteger))
    watch_time_minutes: Optional[int] = Field(sa_column=Column(BigInteger))
    avg_view_duration_seconds: Optional[int] = Field(sa_column=Column(BigInteger))
    avg_percent_viewed: Optional[float] = Field(sa_column=Column(NUMERIC(5, 2)))  # 0..100
    likes: Optional[int] = Field(sa_column=Column(BigInteger))
    comments: Optional[int] = Field(sa_column=Column(BigInteger))
    shares: Optional[int] = Field(sa_column=Column(BigInteger))
    impressions: Optional[int] = Field(sa_column=Column(BigInteger))
    click_through_rate: Optional[float] = Field(sa_column=Column(NUMERIC(5, 2)))  # 0..100
    subs_gained_from_video: Optional[int] = Field(sa_column=Column(BigInteger))
    estimated_revenue: Optional[float] = Field(sa_column=Column(NUMERIC(12, 4)))
    revenue_currency: Optional[str] = Field(default="USD", sa_column=Column(CHAR(3)))

    __table_args__ = (
        CheckConstraint("views >= 0", name="ck_vdm_views_nonneg"),
        CheckConstraint("watch_time_minutes >= 0", name="ck_vdm_wtm_nonneg"),
        CheckConstraint("avg_view_duration_seconds >= 0", name="ck_vdm_avd_nonneg"),
        CheckConstraint("avg_percent_viewed >= 0 AND avg_percent_viewed <= 100", name="ck_vdm_apv_pct"),
        CheckConstraint("likes >= 0", name="ck_vdm_likes_nonneg"),
        CheckConstraint("comments >= 0", name="ck_vdm_comments_nonneg"),
        CheckConstraint("shares >= 0", name="ck_vdm_shares_nonneg"),
        CheckConstraint("impressions >= 0", name="ck_vdm_impr_nonneg"),
        CheckConstraint("click_through_rate >= 0 AND click_through_rate <= 100", name="ck_vdm_ctr_pct"),
        CheckConstraint("subs_gained_from_video >= 0", name="ck_vdm_subs_nonneg"),
        CheckConstraint("estimated_revenue >= 0", name="ck_vdm_rev_nonneg"),
    )


# ===========================================================
#                  HOURLY ROLLUPS (recent)
# ===========================================================
class ChannelHourlyMetrics(SQLModel, table=True):
    __tablename__ = "channel_hourly_metrics"

    channel_id: int = Field(
        sa_column=Column(
            ForeignKey("channel.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    # IMPORTANT: only set primary_key in sa_column for composite PKs
    hour_start: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            primary_key=True,
            nullable=False,
        )
    )

    views: Optional[int] = Field(sa_column=Column(BigInteger))
    watch_time_minutes: Optional[int] = Field(sa_column=Column(BigInteger))
    impressions: Optional[int] = Field(sa_column=Column(BigInteger))
    likes: Optional[int] = Field(sa_column=Column(BigInteger))
    comments: Optional[int] = Field(sa_column=Column(BigInteger))
    subscribers_gained: Optional[int] = Field(sa_column=Column(BigInteger))
    estimated_revenue: Optional[float] = Field(sa_column=Column(NUMERIC(12, 4)))

    __table_args__ = tuple(
        filter(
            None,
            (
                Index("ix_chm_channel_hour", "channel_id", "hour_start"),
                PG_ONLY(CheckConstraint("date_trunc('hour', hour_start) = hour_start", name="ck_chm_start_on_hour")),
                CheckConstraint("views >= 0", name="ck_chm_views_nonneg"),
                CheckConstraint("watch_time_minutes >= 0", name="ck_chm_wtm_nonneg"),
                CheckConstraint("impressions >= 0", name="ck_chm_impr_nonneg"),
                CheckConstraint("likes >= 0", name="ck_chm_likes_nonneg"),
                CheckConstraint("comments >= 0", name="ck_chm_comments_nonneg"),
                CheckConstraint("subscribers_gained >= 0", name="ck_chm_subs_nonneg"),
                CheckConstraint("estimated_revenue >= 0", name="ck_chm_rev_nonneg"),
            ),
        )
    )


class VideoHourlyMetrics(SQLModel, table=True):
    __tablename__ = "video_hourly_metrics"

    video_id: int = Field(
        sa_column=Column(
            ForeignKey("video.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    # IMPORTANT: only set primary_key in sa_column for composite PKs
    hour_start: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            primary_key=True,
            nullable=False,
        )
    )

    views: Optional[int] = Field(sa_column=Column(BigInteger))
    watch_time_minutes: Optional[int] = Field(sa_column=Column(BigInteger))
    impressions: Optional[int] = Field(sa_column=Column(BigInteger))
    likes: Optional[int] = Field(sa_column=Column(BigInteger))
    comments: Optional[int] = Field(sa_column=Column(BigInteger))
    subs_gained_from_video: Optional[int] = Field(sa_column=Column(BigInteger))
    estimated_revenue: Optional[float] = Field(sa_column=Column(NUMERIC(12, 4)))

    __table_args__ = tuple(
        filter(
            None,
            (
                Index("ix_vhm_video_hour", "video_id", "hour_start"),
                PG_ONLY(CheckConstraint("date_trunc('hour', hour_start) = hour_start", name="ck_vhm_start_on_hour")),
                CheckConstraint("views >= 0", name="ck_vhm_views_nonneg"),
                CheckConstraint("watch_time_minutes >= 0", name="ck_vhm_wtm_nonneg"),
                CheckConstraint("impressions >= 0", name="ck_vhm_impr_nonneg"),
                CheckConstraint("likes >= 0", name="ck_vhm_likes_nonneg"),
                CheckConstraint("comments >= 0", name="ck_vhm_comments_nonneg"),
                CheckConstraint("subs_gained_from_video >= 0", name="ck_vhm_subs_nonneg"),
                CheckConstraint("estimated_revenue >= 0", name="ck_vhm_rev_nonneg"),
            ),
        )
    )
