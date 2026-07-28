"""Add balance_sheet_items table for manual balance sheet entries

Revision ID: 020
Revises: 019
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "balance_sheet_items",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column(
            "section",
            sa.Enum(
                "non_current_assets",
                "current_assets",
                "equity",
                "current_liabilities",
                name="bs_section",
            ),
            nullable=False,
        ),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_bs_items_tenant", "balance_sheet_items", ["tenant_id"])


def downgrade():
    op.drop_index("ix_bs_items_tenant", "balance_sheet_items")
    op.drop_table("balance_sheet_items")
