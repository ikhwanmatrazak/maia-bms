"""add user permissions column

Revision ID: 014
Revises: 013
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("permissions", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("users", "permissions")
