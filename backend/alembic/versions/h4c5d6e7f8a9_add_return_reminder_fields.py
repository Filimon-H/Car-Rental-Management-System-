"""Add return_reminder_sent_days and overdue_notified_at to agreements

Revision ID: h4c5d6e7f8a9
Revises: f3a4b5c6d7e8
Create Date: 2026-05-09
"""
from alembic import op
# alembic/ is a script directory, not an importable package, so load the shared
# migration helpers by path.
import importlib.util as _ilu, pathlib as _pl
_spec = _ilu.spec_from_file_location(
    "migration_helpers", _pl.Path(__file__).resolve().parents[1] / "migration_helpers.py"
)
_mh = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mh)
add_column_if_missing = _mh.add_column_if_missing
import sqlalchemy as sa


revision = 'h4c5d6e7f8a9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing('agreements', sa.Column('return_reminder_sent_days', sa.Integer(), nullable=True))
    add_column_if_missing('agreements', sa.Column('overdue_notified_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('agreements', 'overdue_notified_at')
    op.drop_column('agreements', 'return_reminder_sent_days')
