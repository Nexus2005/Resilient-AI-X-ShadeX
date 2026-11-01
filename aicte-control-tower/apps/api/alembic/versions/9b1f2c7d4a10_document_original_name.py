"""document original file name

Revision ID: 9b1f2c7d4a10
Revises: 0828f4603958
Create Date: 2026-11-01 12:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9b1f2c7d4a10"
down_revision: str | None = "0828f4603958"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("original_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "original_name")
