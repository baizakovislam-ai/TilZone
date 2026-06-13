"""Add options/order_index to tasks, enrich theory

Revision ID: 0002_tasks_options_theory_enrich
Revises: 0001_initial_schema
Create Date: 2026-06-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_tasks_options_theory_enrich"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # tasks: add options (JSON-array for choice tasks), order_index, explanation
    op.add_column("tasks", sa.Column("options", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("order_index", sa.Integer(), server_default="0", nullable=False))
    op.add_column("tasks", sa.Column("explanation", sa.Text(), nullable=True))

    # theory: add audio_url, image_url, order_index, is_published
    op.add_column("theory", sa.Column("audio_url", sa.String(500), nullable=True))
    op.add_column("theory", sa.Column("image_url", sa.String(500), nullable=True))
    op.add_column("theory", sa.Column("order_index", sa.Integer(), server_default="0", nullable=False))
    op.add_column("theory", sa.Column("is_published", sa.Boolean(), server_default="true", nullable=False))

    # lessons: add description, thumbnail, order_index
    op.add_column("lessons", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("lessons", sa.Column("order_index", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("tasks", "options")
    op.drop_column("tasks", "order_index")
    op.drop_column("tasks", "explanation")

    op.drop_column("theory", "audio_url")
    op.drop_column("theory", "image_url")
    op.drop_column("theory", "order_index")
    op.drop_column("theory", "is_published")

    op.drop_column("lessons", "description")
    op.drop_column("lessons", "order_index")