"""Record whether an agreement's return charges have been posted

Revision ID: m8a9b0c1d2e3
Revises: k7f8a9b0c1d2
Create Date: 2026-10-20

Return charges (late fee, excess mileage, fuel) are now posted when the car
comes back, not when the agreement is closed, so an agreement can wait in
RETURNED for its balance to be settled. Existing rows start False: an
agreement already RETURNED had nothing posted, and gets its charges once,
when it is closed.
"""
import sqlalchemy as sa
# alembic/ is a script directory, not an importable package, so load the shared
# migration helpers by path.
import importlib.util as _ilu, pathlib as _pl
_spec = _ilu.spec_from_file_location(
    "migration_helpers", _pl.Path(__file__).resolve().parents[1] / "migration_helpers.py"
)
_mh = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mh)

revision = "m8a9b0c1d2e3"
down_revision = "k7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    _mh.add_column_if_missing(
        "agreements",
        sa.Column("return_charges_posted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    _mh.drop_column_if_present("agreements", "return_charges_posted")
