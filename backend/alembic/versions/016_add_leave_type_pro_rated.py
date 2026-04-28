"""add is_pro_rated to hr_leave_types

Revision ID: 016
Revises: 015
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hr_leave_types", sa.Column("is_pro_rated", sa.Boolean(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("hr_leave_types", "is_pro_rated")
