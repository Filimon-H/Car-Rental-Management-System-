"""Add commission_rate to vendors

Revision ID: a1b2c3d4e5f6
Revises: 502eb273b892
Create Date: 2026-05-08
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


revision = 'a1b2c3d4e5f6'
down_revision = '502eb273b892'
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing('vendors', sa.Column('commission_rate', sa.Numeric(5, 2), nullable=False, server_default='70.00'))


def downgrade() -> None:
    op.drop_column('vendors', 'commission_rate')
