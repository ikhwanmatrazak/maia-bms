"""Add company_registration_no to company_settings

Revision ID: 007
Revises: 006
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('company_settings', sa.Column('company_registration_no', sa.String(50), nullable=True))


def downgrade():
    op.drop_column('company_settings', 'company_registration_no')
