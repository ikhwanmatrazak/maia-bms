"""Change logo_url and signature_image_url to TEXT for base64 storage

Revision ID: 010
Revises: 009
Create Date: 2026-03-15
"""
from alembic import op
from sqlalchemy import text

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Always safe to run — MODIFY COLUMN is idempotent on MariaDB/MySQL
    try:
        conn.execute(text(
            "ALTER TABLE company_settings MODIFY COLUMN logo_url LONGTEXT NULL"
        ))
    except Exception:
        pass
    try:
        conn.execute(text(
            "ALTER TABLE company_settings MODIFY COLUMN signature_image_url LONGTEXT NULL"
        ))
    except Exception:
        pass


def downgrade():
    pass
