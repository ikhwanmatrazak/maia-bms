"""Add prospects table

Revision ID: 006
Revises: 005
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'prospects',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('company_name', sa.String(255), nullable=False),
        sa.Column('contact_person', sa.String(255), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('stage', sa.Enum('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost', name='prospectstage'), nullable=False, server_default='lead'),
        sa.Column('expected_value', sa.Numeric(15, 2), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='MYR'),
        sa.Column('source', sa.Enum('referral', 'website', 'social_media', 'cold_call', 'exhibition', 'existing_client', 'other', name='prospectsource'), nullable=True),
        sa.Column('expected_close_date', sa.Date(), nullable=True),
        sa.Column('probability', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('lost_reason', sa.Text(), nullable=True),
        sa.Column('assigned_to', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_converted', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('converted_client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='SET NULL'), nullable=True),
        sa.Column('converted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('prospects')
    op.execute("DROP TYPE IF EXISTS prospectstage")
    op.execute("DROP TYPE IF EXISTS prospectsource")
