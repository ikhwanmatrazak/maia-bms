"""add contract_end_date to hr_employees

Revision ID: 015
Revises: 014
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hr_employees", sa.Column("contract_end_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("hr_employees", "contract_end_date")
