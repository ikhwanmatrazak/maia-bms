"""Force logo_url and signature_image_url to LONGTEXT

Revision ID: 011
Revises: 010
Create Date: 2026-03-15
"""
from alembic import op
from sqlalchemy import text

revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
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
