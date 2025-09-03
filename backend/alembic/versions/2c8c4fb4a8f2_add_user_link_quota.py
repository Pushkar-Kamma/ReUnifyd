"""add user.link_quota

Revision ID: 2c8c4fb4a8f2
Revises: 9b1d1f2a0a01
Create Date: 2025-08-29 00:00:00.000001

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2c8c4fb4a8f2"
down_revision: Union[str, None] = "9b1d1f2a0a01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    try:
        cols = [c["name"] for c in insp.get_columns(table)]
    except Exception:
        res = conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
        cols = [r[1] for r in res]
    return column in cols


def upgrade() -> None:
    if not _has_column("user", "link_quota"):
        op.add_column("user", sa.Column("link_quota", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _has_column("user", "link_quota"):
        op.drop_column("user", "link_quota")

