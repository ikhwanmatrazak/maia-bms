"""Add CRM features: contacts, client segmentation, email tracking

Revision ID: 012
Revises: 011
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade():
    # Client contacts table
    op.create_table('client_contacts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(100), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('is_primary', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_client_contacts_client_id', 'client_contacts', ['client_id'])

    # Client segmentation fields
    conn = op.get_bind()
    try:
        conn.execute(sa.text("ALTER TABLE clients ADD COLUMN industry VARCHAR(100) NULL"))
    except Exception:
        pass
    try:
        conn.execute(sa.text("ALTER TABLE clients ADD COLUMN tags VARCHAR(500) NULL"))
    except Exception:
        pass
    try:
        conn.execute(sa.text("ALTER TABLE clients ADD COLUMN region VARCHAR(100) NULL"))
    except Exception:
        pass
    try:
        conn.execute(sa.text("ALTER TABLE clients ADD COLUMN company_size VARCHAR(50) NULL"))
    except Exception:
        pass

    # Email tracking table
    op.create_table('email_tracking',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('token', sa.String(64), unique=True, nullable=False),
        sa.Column('doc_type', sa.String(50), nullable=False),
        sa.Column('doc_id', sa.Integer(), nullable=False),
        sa.Column('recipient_email', sa.String(255), nullable=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('open_count', sa.Integer(), default=0),
    )
    op.create_index('ix_email_tracking_token', 'email_tracking', ['token'])


def downgrade():
    op.drop_index('ix_email_tracking_token', 'email_tracking')
    op.drop_table('email_tracking')
    op.drop_index('ix_client_contacts_client_id', 'client_contacts')
    op.drop_table('client_contacts')
