"""add branch and pic_employee_id to clients

Revision ID: 017
Revises: 016
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("clients", sa.Column("branch", sa.String(255), nullable=True))
    op.add_column("clients", sa.Column("pic_employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True))


def downgrade():
    op.drop_column("clients", "pic_employee_id")
    op.drop_column("clients", "branch")
