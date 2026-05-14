from __future__ import annotations

import datetime as dt
import os

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CHAR, JSONB, NUMERIC, TIMESTAMP, VARCHAR
from sqlalchemy.types import JSON, BigInteger
from sqlmodel import Field, SQLModel

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

    id: int | None = Field(default=None, primary_key=True)
    name: str | None = None
    email: str = Field(index=True, unique=True, nullable=False)
    password_hash: str | None = None

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

    id: int | None = Field(default=None, primary_key=True)
    # DB enforces allowed values via triggers; use VARCHAR(9) to match DDL
    name: str = Field(sa_column=Column(VARCHAR(9), nullable=False))
    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_platform_name"),
    )


# -----------------------
# Connected accounts & OAuth
# -----------------------
class PlatformAccount(SQLModel, table=True):
    __tablename__ = "platform_account"

    id: int | None = Field(default=None, primary_key=True)
    platform_id: int = Field(
        sa_column=Column(
            ForeignKey("platform.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    owner_user_id: int = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    display_name: str | None = None

    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )


class OAuthCredential(SQLModel, table=True):
    __tablename__ = "oauth_credential"

    id: int | None = Field(default=None, primary_key=True)
    platform_account_id: int = Field(
        sa_column=Column(
            ForeignKey("platform_account.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    access_token_encrypted: str = Field(nullable=False)
    refresh_token_encrypted: str | None = None
    scopes: str | None = Field(sa_column=Column(VARCHAR(1024)))
    expires_at: dt.datetime | None = Field(
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

    id: int | None = Field(default=None, primary_key=True)

    platform_id: int = Field(
        sa_column=Column(ForeignKey("platform.id", ondelete="RESTRICT"), nullable=False)
    )
    platform_account_id: int | None = Field(
        sa_column=Column(
            ForeignKey("platform_account.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    external_channel_id: str = Field(nullable=False)

    title: str | None = None
    description: str | None = None
    country: str | None = Field(default=None, sa_column=Column(CHAR(2)))
    language: str | None = Field(default=None, sa_column=Column(CHAR(2)))
    custom_url: str | None = None
    avatar_url: str | None = None
    banner_url: str | None = None
    subscriber_count: int | None = Field(default=None, sa_column=Column(BigInteger))
    is_monetized: bool | None = None
    published_at: dt.datetime | None = Field(
        sa_column=Column(TIMESTAMP(timezone=True))
    )

    last_synced_at: dt.datetime | None = Field(
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

    id: int | None = Field(default=None, primary_key=True)
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
    # DB validates via trigger; match DDL width
    role: str = Field(sa_column=Column(VARCHAR(6), nullable=False, server_default="viewer"))
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

    id: int | None = Field(default=None, primary_key=True)

    platform_id: int = Field(
        sa_column=Column(ForeignKey("platform.id", ondelete="RESTRICT"), nullable=False)
    )
    channel_id: int = Field(
        sa_column=Column(ForeignKey("channel.id", ondelete="CASCADE"), nullable=False)
    )
    external_video_id: str = Field(nullable=False)

    title: str | None = None
    description: str | None = None
    category: str | None = None
    # Triggers enforce allowed values; lengths match DDL
    privacy_status: str | None = Field(sa_column=Column(VARCHAR(8)))
    content_type: str | None = Field(sa_column=Column(VARCHAR(5)))
    duration_seconds: int | None = Field(sa_column=Column(BigInteger))
    published_at: dt.datetime | None = Field(
        sa_column=Column(TIMESTAMP(timezone=True))
    )
    thumbnail_url: str | None = None
    tags: dict | None = Field(default=None, sa_column=Column(JSONType))

    last_synced_at: dt.datetime | None = Field(
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

    subscribers_total: int | None = Field(sa_column=Column(BigInteger))
    subscribers_gained: int | None = Field(sa_column=Column(BigInteger))
    subscribers_lost: int | None = Field(sa_column=Column(BigInteger))
    views: int | None = Field(sa_column=Column(BigInteger))
    watch_time_minutes: int | None = Field(sa_column=Column(BigInteger))
    impressions: int | None = Field(sa_column=Column(BigInteger))
    click_through_rate: float | None = Field(sa_column=Column(NUMERIC(5, 2)))  # 0..100
    estimated_revenue: float | None = Field(sa_column=Column(NUMERIC(12, 4)))
    revenue_currency: str | None = Field(default=None, sa_column=Column(CHAR(3)))

    __table_args__ = (
        Index("ix_cdm_channel_date", "channel_id", "date"),
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

    views: int | None = Field(sa_column=Column(BigInteger))
    watch_time_minutes: int | None = Field(sa_column=Column(BigInteger))
    avg_view_duration_seconds: int | None = Field(sa_column=Column(BigInteger))
    avg_percent_viewed: float | None = Field(sa_column=Column(NUMERIC(5, 2)))  # 0..100
    likes: int | None = Field(sa_column=Column(BigInteger))
    comments: int | None = Field(sa_column=Column(BigInteger))
    shares: int | None = Field(sa_column=Column(BigInteger))
    impressions: int | None = Field(sa_column=Column(BigInteger))
    click_through_rate: float | None = Field(sa_column=Column(NUMERIC(5, 2)))  # 0..100
    subs_gained_from_video: int | None = Field(sa_column=Column(BigInteger))
    estimated_revenue: float | None = Field(sa_column=Column(NUMERIC(12, 4)))
    revenue_currency: str | None = Field(default=None, sa_column=Column(CHAR(3)))

    __table_args__ = (
        Index("ix_vdm_video_date", "video_id", "date"),
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
    hour_start: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            primary_key=True,
            nullable=False,
        )
    )

    views: int | None = Field(sa_column=Column(BigInteger))
    watch_time_minutes: int | None = Field(sa_column=Column(BigInteger))
    impressions: int | None = Field(sa_column=Column(BigInteger))
    likes: int | None = Field(sa_column=Column(BigInteger))
    comments: int | None = Field(sa_column=Column(BigInteger))
    subscribers_gained: int | None = Field(sa_column=Column(BigInteger))
    estimated_revenue: float | None = Field(sa_column=Column(NUMERIC(12, 4)))

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
    hour_start: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            primary_key=True,
            nullable=False,
        )
    )

    views: int | None = Field(sa_column=Column(BigInteger))
    watch_time_minutes: int | None = Field(sa_column=Column(BigInteger))
    impressions: int | None = Field(sa_column=Column(BigInteger))
    likes: int | None = Field(sa_column=Column(BigInteger))
    comments: int | None = Field(sa_column=Column(BigInteger))
    subs_gained_from_video: int | None = Field(sa_column=Column(BigInteger))
    estimated_revenue: float | None = Field(sa_column=Column(NUMERIC(12, 4)))

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


# ===========================================================
#                  CONTENT GROUPS (cross-platform comparison)
# ===========================================================
class ContentGroup(SQLModel, table=True):
    """A user-defined group of videos representing the same piece of content
    posted across different channels/platforms (e.g. a YT Short, IG Reel, and TikTok
    of the same clip). Used to compare normalized metrics side-by-side.
    """
    __tablename__ = "content_group"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    name: str = Field(nullable=False)
    description: str | None = None
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


class ContentGroupItem(SQLModel, table=True):
    """Membership of a video in a ContentGroup."""
    __tablename__ = "content_group_item"

    id: int | None = Field(default=None, primary_key=True)
    content_group_id: int = Field(
        sa_column=Column(
            ForeignKey("content_group.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    video_id: int = Field(
        sa_column=Column(
            ForeignKey("video.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    note: str | None = None
    created_at: dt.datetime = Field(
        sa_column=Column(
            TIMESTAMP(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )

    __table_args__ = (
        UniqueConstraint("content_group_id", "video_id", name="uq_content_group_video"),
    )

