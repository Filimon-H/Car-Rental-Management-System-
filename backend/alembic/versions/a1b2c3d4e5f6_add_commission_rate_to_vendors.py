"""Add commission_rate to vendors

Revision ID: a1b2c3d4e5f6
Revises: 502eb273b892
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '502eb273b892'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('vendors', sa.Column('commission_rate', sa.Numeric(5, 2), nullable=False, server_default='70.00'))


def downgrade() -> None:
    op.drop_column('vendors', 'commission_rate')
