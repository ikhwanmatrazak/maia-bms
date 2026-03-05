"""Initial migration

Revision ID: 001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'manager', 'staff', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # refresh_tokens
    op.create_table('refresh_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(255), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_refresh_tokens_token_hash', 'refresh_tokens', ['token_hash'])

    # company_settings
    op.create_table('company_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False, default='MAIA'),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('website', sa.String(255), nullable=True),
        sa.Column('default_currency', sa.String(3), nullable=False, default='MYR'),
        sa.Column('default_payment_terms', sa.Integer(), default=30),
        sa.Column('invoice_prefix', sa.String(20), default='INV'),
        sa.Column('quotation_prefix', sa.String(20), default='QT'),
        sa.Column('receipt_prefix', sa.String(20), default='RCP'),
        sa.Column('smtp_host', sa.String(255), nullable=True),
        sa.Column('smtp_port', sa.Integer(), default=587),
        sa.Column('smtp_user', sa.String(255), nullable=True),
        sa.Column('smtp_pass_encrypted', sa.Text(), nullable=True),
        sa.Column('smtp_from_email', sa.String(255), nullable=True),
        sa.Column('smtp_from_name', sa.String(255), nullable=True),
        sa.Column('signature_image_url', sa.String(500), nullable=True),
        sa.Column('primary_color', sa.String(7), default='#1a1a2e'),
        sa.Column('accent_color', sa.String(7), default='#16213e'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # tax_rates
    op.create_table('tax_rates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('rate', sa.Numeric(5, 2), nullable=False),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # document_templates
    op.create_table('document_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('type', sa.Enum('quotation', 'invoice', 'receipt', name='templatetype'), nullable=False),
        sa.Column('template_json', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # clients
    op.create_table('clients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_name', sa.String(255), nullable=False),
        sa.Column('contact_person', sa.String(255), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('currency', sa.String(3), default='MYR'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('active', 'inactive', name='clientstatus'), nullable=False, default='active'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_clients_company_name', 'clients', ['company_name'])
    op.create_index('ix_clients_email', 'clients', ['email'])

    # activities
    op.create_table('activities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('type', sa.Enum('call','email','meeting','note','quote_sent','invoice_sent','payment_received', name='activitytype'), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # reminders
    op.create_table('reminders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_completed', sa.Boolean(), default=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('priority', sa.Enum('low','medium','high', name='reminderpriority'), nullable=False, default='medium'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # quotations
    op.create_table('quotations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quotation_number', sa.String(50), nullable=False),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.Enum('draft','sent','accepted','rejected','expired', name='quotationstatus'), nullable=False, default='draft'),
        sa.Column('currency', sa.String(3), nullable=False, default='MYR'),
        sa.Column('exchange_rate', sa.Numeric(10, 6), default=1.0),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expiry_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('subtotal', sa.Numeric(15, 2), default=0.00),
        sa.Column('discount_amount', sa.Numeric(15, 2), default=0.00),
        sa.Column('tax_total', sa.Numeric(15, 2), default=0.00),
        sa.Column('total', sa.Numeric(15, 2), default=0.00),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms_conditions', sa.Text(), nullable=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('document_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('quotation_number'),
    )

    # quotation_items
    op.create_table('quotation_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quotation_id', sa.Integer(), sa.ForeignKey('quotations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, default=1),
        sa.Column('unit_price', sa.Numeric(15, 2), nullable=False, default=0.00),
        sa.Column('tax_rate_id', sa.Integer(), sa.ForeignKey('tax_rates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('tax_amount', sa.Numeric(15, 2), default=0.00),
        sa.Column('line_total', sa.Numeric(15, 2), default=0.00),
        sa.Column('sort_order', sa.Integer(), default=0),
        sa.PrimaryKeyConstraint('id'),
    )

    # invoices
    op.create_table('invoices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('invoice_number', sa.String(50), nullable=False),
        sa.Column('quotation_id', sa.Integer(), sa.ForeignKey('quotations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.Enum('draft','sent','partial','paid','overdue','cancelled', name='invoicestatus'), nullable=False, default='draft'),
        sa.Column('currency', sa.String(3), nullable=False, default='MYR'),
        sa.Column('exchange_rate', sa.Numeric(10, 6), default=1.0),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('subtotal', sa.Numeric(15, 2), default=0.00),
        sa.Column('discount_amount', sa.Numeric(15, 2), default=0.00),
        sa.Column('tax_total', sa.Numeric(15, 2), default=0.00),
        sa.Column('total', sa.Numeric(15, 2), default=0.00),
        sa.Column('amount_paid', sa.Numeric(15, 2), default=0.00),
        sa.Column('balance_due', sa.Numeric(15, 2), default=0.00),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms_conditions', sa.Text(), nullable=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('document_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invoice_number'),
    )

    # invoice_items
    op.create_table('invoice_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, default=1),
        sa.Column('unit_price', sa.Numeric(15, 2), nullable=False, default=0.00),
        sa.Column('tax_rate_id', sa.Integer(), sa.ForeignKey('tax_rates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('tax_amount', sa.Numeric(15, 2), default=0.00),
        sa.Column('line_total', sa.Numeric(15, 2), default=0.00),
        sa.Column('sort_order', sa.Integer(), default=0),
        sa.PrimaryKeyConstraint('id'),
    )

    # receipts
    op.create_table('receipts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('receipt_number', sa.String(50), nullable=False),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, default='MYR'),
        sa.Column('exchange_rate', sa.Numeric(10, 6), default=1.0),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('payment_method', sa.Enum('cash','bank_transfer','cheque','online','other', name='paymentmethod'), nullable=False),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('document_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('receipt_number'),
    )

    # payments
    op.create_table('payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('receipt_id', sa.Integer(), sa.ForeignKey('receipts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, default='MYR'),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('payment_method', sa.Enum('cash','bank_transfer','cheque','online','other', name='paymentmethod'), nullable=False),
        sa.Column('reference_number', sa.String(100), nullable=True),
        sa.Column('proof_file_url', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('recorded_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # expense_categories
    op.create_table('expense_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('color', sa.String(7), default='#6366f1'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # expenses
    op.create_table('expenses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('expense_categories.id', ondelete='SET NULL'), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, default='MYR'),
        sa.Column('exchange_rate', sa.Numeric(10, 6), default=1.0),
        sa.Column('expense_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('vendor', sa.String(255), nullable=True),
        sa.Column('receipt_url', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('expenses')
    op.drop_table('expense_categories')
    op.drop_table('payments')
    op.drop_table('receipts')
    op.drop_table('invoice_items')
    op.drop_table('invoices')
    op.drop_table('quotation_items')
    op.drop_table('quotations')
    op.drop_table('reminders')
    op.drop_table('activities')
    op.drop_table('clients')
    op.drop_table('document_templates')
    op.drop_table('tax_rates')
    op.drop_table('company_settings')
    op.drop_table('refresh_tokens')
    op.drop_table('users')
