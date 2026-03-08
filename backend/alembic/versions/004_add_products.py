"""Add products and subscriptions

Revision ID: 004
Revises: 003
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('unit_price', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('currency', sa.String(3), nullable=False, server_default='MYR'),
        sa.Column('unit_label', sa.String(50), nullable=True),
        sa.Column('billing_cycle', sa.Enum('one_time', 'monthly', 'quarterly', 'annually', name='billingcycle'), nullable=False, server_default='one_time'),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('email_subject', sa.String(500), nullable=True),
        sa.Column('email_body', sa.Text(), nullable=True),
        sa.Column('document_template_id', sa.Integer(), sa.ForeignKey('document_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
    )

    op.create_table(
        'product_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('next_renewal_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('billing_cycle', sa.Enum('one_time', 'monthly', 'quarterly', 'annually', name='billingcycle'), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('status', sa.Enum('active', 'paused', 'cancelled', name='subscriptionstatus'), nullable=False, server_default='active'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
    )


def downgrade():
    op.drop_table('product_subscriptions')
    op.drop_table('products')
