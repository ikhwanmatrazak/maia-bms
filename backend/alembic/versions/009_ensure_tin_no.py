"""Ensure tin_no column exists in company_settings

Revision ID: 009
Revises: 008
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Check if column already exists (works on MySQL 5.7+)
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        "AND TABLE_NAME = 'company_settings' "
        "AND COLUMN_NAME = 'tin_no'"
    ))
    if result.scalar() == 0:
        conn.execute(text(
            "ALTER TABLE company_settings ADD COLUMN tin_no VARCHAR(50) NULL"
        ))


def downgrade():
    pass
