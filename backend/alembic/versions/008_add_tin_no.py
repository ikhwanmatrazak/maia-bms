"""Add tin_no to company_settings

Revision ID: 008
Revises: 007
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    # Use IF NOT EXISTS so this is safe to re-run if it previously failed silently
    op.execute(text(
        "ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tin_no VARCHAR(50) NULL"
    ))


def downgrade():
    op.drop_column('company_settings', 'tin_no')
