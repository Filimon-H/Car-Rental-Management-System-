"""Add booking_requested to agreement status enum

Revision ID: d1e2f3a4b5c6
Revises: a1b2c3d4e5f6
Create Date: 2026-05-08
"""
from alembic import op


revision = 'd1e2f3a4b5c6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite stores enum values as plain strings — no DDL needed.
    # On PostgreSQL this would be: ALTER TYPE agreementstatus ADD VALUE 'booking_requested'
    pass


def downgrade() -> None:
    pass
