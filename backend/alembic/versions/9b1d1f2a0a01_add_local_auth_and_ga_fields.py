"""add local auth fields + extra GA/channel cols

Revision ID: 9b1d1f2a0a01
Revises: 736ac77fac67
Create Date: 2025-08-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "9b1d1f2a0a01"
down_revision: Union[str, None] = "736ac77fac67"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    try:
        cols = [c["name"] for c in insp.get_columns(table)]
    except Exception:
        # Fallback for some sqlite drivers
        res = conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
        cols = [r[1] for r in res]
    return column in cols


def _has_index(table: str, name: str) -> bool:
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        try:
            rows = conn.exec_driver_sql(f"PRAGMA index_list('{table}')").fetchall()
            idx_names = [r[1] for r in rows]
            return name in idx_names
        except Exception:
            return False
    else:
        insp = sa.inspect(conn)
        idx_names = [i["name"] for i in insp.get_indexes(table)]
        return name in idx_names


def upgrade() -> None:
    # User: username (unique), password_hash
    if not _has_column("user", "username"):
        op.add_column("user", sa.Column("username", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_column("user", "password_hash"):
        op.add_column("user", sa.Column("password_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_index("user", "ix_user_username"):
        op.create_index("ix_user_username", "user", ["username"], unique=True)

    # GoogleAccount: email, sub, access_token_enc, id_token, token_updated_at
    if not _has_column("googleaccount", "email"):
        op.add_column("googleaccount", sa.Column("email", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_column("googleaccount", "sub"):
        op.add_column("googleaccount", sa.Column("sub", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_column("googleaccount", "access_token_enc"):
        op.add_column("googleaccount", sa.Column("access_token_enc", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_column("googleaccount", "id_token"):
        op.add_column("googleaccount", sa.Column("id_token", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    if not _has_column("googleaccount", "token_updated_at"):
        op.add_column("googleaccount", sa.Column("token_updated_at", sa.DateTime(), nullable=True))
    if not _has_index("googleaccount", "ix_googleaccount_email"):
        op.create_index("ix_googleaccount_email", "googleaccount", ["email"], unique=False)

    # Channel: first_seen_at, last_synced_at
    if not _has_column("channel", "first_seen_at"):
        op.add_column("channel", sa.Column("first_seen_at", sa.DateTime(), nullable=True))
    if not _has_column("channel", "last_synced_at"):
        op.add_column("channel", sa.Column("last_synced_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Channel
    op.drop_column("channel", "last_synced_at")
    op.drop_column("channel", "first_seen_at")

    # GoogleAccount
    op.drop_index("ix_googleaccount_email", table_name="googleaccount")
    op.drop_column("googleaccount", "token_updated_at")
    op.drop_column("googleaccount", "id_token")
    op.drop_column("googleaccount", "access_token_enc")
    op.drop_column("googleaccount", "sub")
    op.drop_column("googleaccount", "email")

    # User
    op.drop_index("ix_user_username", table_name="user")
    op.drop_column("user", "password_hash")
    op.drop_column("user", "username")
