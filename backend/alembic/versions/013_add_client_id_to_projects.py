"""Add client_id to projects table

Revision ID: 013
Revises: 012
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id', ondelete='SET NULL'), nullable=True))


def downgrade():
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('client_id')
