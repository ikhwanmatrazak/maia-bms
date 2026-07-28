"""Add is_reconciled and reconciled_at to bank_transactions

Revision ID: 019
Revises: 018
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "bank_transactions",
        sa.Column("is_reconciled", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "bank_transactions",
        sa.Column("reconciled_at", sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column("bank_transactions", "reconciled_at")
    op.drop_column("bank_transactions", "is_reconciled")
