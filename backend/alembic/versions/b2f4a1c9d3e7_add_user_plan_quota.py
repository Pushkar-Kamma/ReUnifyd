"""add user.plan and user.channel_quota

Revision ID: b2f4a1c9d3e7
Revises: 0073b9e2a296
Create Date: 2026-06-10 09:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2f4a1c9d3e7"
down_revision: Union[str, None] = "0073b9e2a296"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "plan",
                sa.VARCHAR(length=16),
                nullable=False,
                server_default="free",
            )
        )
        batch_op.add_column(
            sa.Column(
                "channel_quota",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("channel_quota")
        batch_op.drop_column("plan")
