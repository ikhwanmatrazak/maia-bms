"""Add tin_no to company_settings

Revision ID: 008
Revises: 007
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('company_settings', sa.Column('tin_no', sa.String(50), nullable=True))


def downgrade():
    op.drop_column('company_settings', 'tin_no')
