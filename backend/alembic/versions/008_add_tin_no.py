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
    conn = op.get_bind()
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
