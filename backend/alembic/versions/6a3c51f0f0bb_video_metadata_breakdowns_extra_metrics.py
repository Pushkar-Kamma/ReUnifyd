"""add video metadata fields, breakdowns table, extra metrics

Revision ID: 6a3c51f0f0bb
Revises: 2c8c4fb4a8f2
Create Date: 2025-08-29 00:00:00.000002

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = "6a3c51f0f0bb"
down_revision: Union[str, None] = "2c8c4fb4a8f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    try:
        insp = sa.inspect(conn)
        cols = [c["name"] for c in insp.get_columns(table)]
    except Exception:
        res = conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
        cols = [r[1] for r in res]
    return column in cols


def upgrade() -> None:
    # VideoMap
    if not _has_column("videomap", "description"):
        op.add_column("videomap", sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_column("videomap", "thumbnail_url"):
        op.add_column("videomap", sa.Column("thumbnail_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # MetricDaily: extra fields
    if not _has_column("metricdaily", "end_screen_ctr_pct"):
        op.add_column("metricdaily", sa.Column("end_screen_ctr_pct", sa.Float(), nullable=True))
    if not _has_column("metricdaily", "shorts_swipe_vs_view_pct"):
        op.add_column("metricdaily", sa.Column("shorts_swipe_vs_view_pct", sa.Float(), nullable=True))

    # MetricBreakdownDaily table
    op.create_table(
        "metricbreakdowndaily",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel_id", sa.Integer(), nullable=False),
        sa.Column("video_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("dimension", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("views", sa.Integer(), nullable=False),
        sa.Column("watch_time_min", sa.Integer(), nullable=False),
        sa.Column("impressions", sa.Integer(), nullable=True),
        sa.Column("impressions_ctr_pct", sa.Float(), nullable=True),
        sa.Column("likes", sa.Integer(), nullable=True),
        sa.Column("subs_gained", sa.Integer(), nullable=True),
        sa.Column("subs_lost", sa.Integer(), nullable=True),
        sa.Column("est_revenue_minor", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["channel_id"], ["channel.id"]),
    )
    op.create_index("ix_metricbreakdowndaily_channel_id", "metricbreakdowndaily", ["channel_id"], unique=False)
    op.create_index("ix_metricbreakdowndaily_video_id", "metricbreakdowndaily", ["video_id"], unique=False)
    op.create_index("ix_metricbreakdowndaily_date", "metricbreakdowndaily", ["date"], unique=False)
    op.create_index("ix_metricbreakdowndaily_dimension", "metricbreakdowndaily", ["dimension"], unique=False)
    op.create_index("ix_metricbreakdowndaily_key", "metricbreakdowndaily", ["key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_metricbreakdowndaily_key", table_name="metricbreakdowndaily")
    op.drop_index("ix_metricbreakdowndaily_dimension", table_name="metricbreakdowndaily")
    op.drop_index("ix_metricbreakdowndaily_date", table_name="metricbreakdowndaily")
    op.drop_index("ix_metricbreakdowndaily_video_id", table_name="metricbreakdowndaily")
    op.drop_index("ix_metricbreakdowndaily_channel_id", table_name="metricbreakdowndaily")
    op.drop_table("metricbreakdowndaily")
    # MetricDaily extra fields
    if _has_column("metricdaily", "shorts_swipe_vs_view_pct"):
        op.drop_column("metricdaily", "shorts_swipe_vs_view_pct")
    if _has_column("metricdaily", "end_screen_ctr_pct"):
        op.drop_column("metricdaily", "end_screen_ctr_pct")
    # VideoMap
    if _has_column("videomap", "thumbnail_url"):
        op.drop_column("videomap", "thumbnail_url")
    if _has_column("videomap", "description"):
        op.drop_column("videomap", "description")

