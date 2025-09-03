"""add user.manual_refresh_date & manual_refresh_count

Revision ID: 0af2e3c1a9d0
Revises: 6a3c51f0f0bb
Create Date: 2025-08-29 00:00:00.000003

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0af2e3c1a9d0"
down_revision: Union[str, None] = "6a3c51f0f0bb"
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
    if not _has_column("user", "manual_refresh_date"):
        op.add_column("user", sa.Column("manual_refresh_date", sa.Date(), nullable=True))
    if not _has_column("user", "manual_refresh_count"):
        op.add_column("user", sa.Column("manual_refresh_count", sa.Integer(), nullable=False, server_default="0"))
        op.alter_column("user", "manual_refresh_count", server_default=None)


def downgrade() -> None:
    if _has_column("user", "manual_refresh_count"):
        op.drop_column("user", "manual_refresh_count")
    if _has_column("user", "manual_refresh_date"):
        op.drop_column("user", "manual_refresh_date")

