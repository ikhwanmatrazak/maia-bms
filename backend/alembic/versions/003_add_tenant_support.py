"""Add multi-tenant support

Revision ID: 003
Revises: 002
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # Create tenants table
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('plan', sa.String(50), server_default='standard'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
    )

    # Insert default tenant for existing data
    op.execute("INSERT INTO tenants (id, name, slug, is_active) VALUES (1, 'Default Company', 'default', 1)")

    # Add tenant_id to users
    op.add_column('users', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.add_column('users', sa.Column('is_super_admin', sa.Boolean(), nullable=False, server_default='0'))
    op.execute("UPDATE users SET tenant_id = 1 WHERE is_super_admin = 0 OR is_super_admin IS NULL")
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])

    # Promote the first admin user to super_admin
    op.execute("UPDATE users SET is_super_admin = 1, tenant_id = NULL WHERE role = 'admin' ORDER BY id LIMIT 1")

    # Add tenant_id to company_settings
    op.add_column('company_settings', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE company_settings SET tenant_id = 1")
    op.create_index('ix_company_settings_tenant_id', 'company_settings', ['tenant_id'])

    # Add tenant_id to clients
    op.add_column('clients', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE clients SET tenant_id = 1")
    op.create_index('ix_clients_tenant_id', 'clients', ['tenant_id'])

    # Add tenant_id to quotations
    op.add_column('quotations', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE quotations SET tenant_id = 1")
    op.create_index('ix_quotations_tenant_id', 'quotations', ['tenant_id'])

    # Add tenant_id to invoices
    op.add_column('invoices', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE invoices SET tenant_id = 1")
    op.create_index('ix_invoices_tenant_id', 'invoices', ['tenant_id'])

    # Add tenant_id to receipts
    op.add_column('receipts', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE receipts SET tenant_id = 1")
    op.create_index('ix_receipts_tenant_id', 'receipts', ['tenant_id'])

    # Add tenant_id to expenses
    op.add_column('expenses', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE expenses SET tenant_id = 1")
    op.create_index('ix_expenses_tenant_id', 'expenses', ['tenant_id'])

    # Add tenant_id to reminders
    op.add_column('reminders', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE reminders SET tenant_id = 1")
    op.create_index('ix_reminders_tenant_id', 'reminders', ['tenant_id'])

    # Add tenant_id to purchase_orders
    op.add_column('purchase_orders', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE purchase_orders SET tenant_id = 1")
    op.create_index('ix_purchase_orders_tenant_id', 'purchase_orders', ['tenant_id'])

    # Add tenant_id to delivery_orders
    op.add_column('delivery_orders', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE delivery_orders SET tenant_id = 1")
    op.create_index('ix_delivery_orders_tenant_id', 'delivery_orders', ['tenant_id'])

    # Add tenant_id to tax_rates
    op.add_column('tax_rates', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE tax_rates SET tenant_id = 1")
    op.create_index('ix_tax_rates_tenant_id', 'tax_rates', ['tenant_id'])

    # Add tenant_id to email_templates (remove unique on doc_type, use tenant+doc_type uniqueness)
    op.add_column('email_templates', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))
    op.execute("UPDATE email_templates SET tenant_id = 1")
    op.create_index('ix_email_templates_tenant_id', 'email_templates', ['tenant_id'])


def downgrade():
    for table in ['email_templates', 'tax_rates', 'delivery_orders', 'purchase_orders',
                  'reminders', 'expenses', 'receipts', 'invoices', 'quotations', 'clients', 'company_settings']:
        op.drop_index(f'ix_{table}_tenant_id', table_name=table)
        op.drop_column(table, 'tenant_id')
    op.drop_index('ix_users_tenant_id', table_name='users')
    op.drop_column('users', 'is_super_admin')
    op.drop_column('users', 'tenant_id')
    op.drop_table('tenants')
