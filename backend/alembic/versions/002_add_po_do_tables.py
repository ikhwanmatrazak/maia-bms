"""Add purchase_orders and delivery_orders tables, and po/do prefix columns

Revision ID: 002
Revises: 001
Create Date: 2026-03-06
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # Add po_prefix and do_prefix to company_settings
    op.add_column('company_settings', sa.Column('po_prefix', sa.String(20), nullable=True, server_default='PO'))
    op.add_column('company_settings', sa.Column('do_prefix', sa.String(20), nullable=True, server_default='DO'))

    # Create purchase_orders table
    op.create_table(
        'purchase_orders',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('po_number', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('vendor_name', sa.String(255), nullable=False),
        sa.Column('vendor_email', sa.String(255), nullable=True),
        sa.Column('vendor_phone', sa.String(100), nullable=True),
        sa.Column('vendor_address', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('draft', 'sent', 'received', 'cancelled', name='purchaseorderstatus'), nullable=False, server_default='draft'),
        sa.Column('currency', sa.String(3), nullable=False, server_default='MYR'),
        sa.Column('exchange_rate', sa.Numeric(10, 6), nullable=True, server_default='1.000000'),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expected_delivery_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('subtotal', sa.Numeric(15, 2), nullable=True, server_default='0.00'),
        sa.Column('discount_amount', sa.Numeric(15, 2), nullable=True, server_default='0.00'),
        sa.Column('tax_total', sa.Numeric(15, 2), nullable=True, server_default='0.00'),
        sa.Column('total', sa.Numeric(15, 2), nullable=True, server_default='0.00'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms_conditions', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
    )

    # Create purchase_order_items table
    op.create_table(
        'purchase_order_items',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('purchase_order_id', sa.Integer(), sa.ForeignKey('purchase_orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, server_default='1'),
        sa.Column('unit_price', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('tax_rate_id', sa.Integer(), sa.ForeignKey('tax_rates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('tax_amount', sa.Numeric(15, 2), nullable=True, server_default='0.00'),
        sa.Column('line_total', sa.Numeric(15, 2), nullable=True, server_default='0.00'),
        sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'),
    )

    # Create delivery_orders table
    op.create_table(
        'delivery_orders',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('do_number', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.Enum('draft', 'sent', 'delivered', 'cancelled', name='deliveryorderstatus'), nullable=False, server_default='draft'),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('delivery_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivery_address', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
    )

    # Create delivery_order_items table
    op.create_table(
        'delivery_order_items',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('delivery_order_id', sa.Integer(), sa.ForeignKey('delivery_orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, server_default='1'),
        sa.Column('unit', sa.String(50), nullable=True, server_default='pcs'),
        sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'),
    )


def downgrade():
    op.drop_table('delivery_order_items')
    op.drop_table('delivery_orders')
    op.drop_table('purchase_order_items')
    op.drop_table('purchase_orders')
    op.drop_column('company_settings', 'do_prefix')
    op.drop_column('company_settings', 'po_prefix')
