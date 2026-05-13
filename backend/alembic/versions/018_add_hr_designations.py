"""add hr_designations table and designation_id to hr_employees

Revision ID: 018
Revises: 017
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hr_designations",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("job_responsibilities", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column(
        "hr_employees",
        sa.Column("designation_id", sa.Integer(), sa.ForeignKey("hr_designations.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade():
    op.drop_column("hr_employees", "designation_id")
    op.drop_table("hr_designations")
