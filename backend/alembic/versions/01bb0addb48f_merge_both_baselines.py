"""merge both baselines

Revision ID: 01bb0addb48f
Revises: 6197a5fddbe0, b8ca5b848c61
Create Date: 2025-09-08 22:35:23.622088

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01bb0addb48f'
down_revision: Union[str, None] = ('6197a5fddbe0', 'b8ca5b848c61')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
