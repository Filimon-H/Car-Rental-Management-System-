"""Add pricing tiers, maintenance records, and mileage/fuel policy fields

Revision ID: k7f8a9b0c1d2
Revises: j6e7f8a9b0c1
Create Date: 2026-09-18

All new columns are nullable, so existing rows keep their current behaviour:
no tier rates means flat daily pricing, and no policy fields means no
excess-mileage or fuel charge on close.
"""
import sqlalchemy as sa
from alembic import op
# alembic/ is a script directory, not an importable package, so load the shared
# migration helpers by path.
import importlib.util as _ilu, pathlib as _pl
_spec = _ilu.spec_from_file_location(
    "migration_helpers", _pl.Path(__file__).resolve().parents[1] / "migration_helpers.py"
)
_mh = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mh)
add_column_if_missing = _mh.add_column_if_missing
table_exists = _mh.table_exists

revision = "k7f8a9b0c1d2"
down_revision = "j6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # I4 — optional weekly/monthly pricing tiers
    add_column_if_missing("vehicles", sa.Column("weekly_rate", sa.Numeric(12, 2), nullable=True))
    add_column_if_missing("vehicles", sa.Column("monthly_rate", sa.Numeric(12, 2), nullable=True))

    # I7 — mileage and fuel policy on the agreement
    add_column_if_missing("agreements", sa.Column("mileage_limit_per_day", sa.Integer(), nullable=True))
    add_column_if_missing("agreements", sa.Column("excess_mileage_rate", sa.Numeric(12, 2), nullable=True))
    add_column_if_missing("agreements", sa.Column("fuel_level_out", sa.Integer(), nullable=True))
    add_column_if_missing("agreements", sa.Column("fuel_level_in", sa.Integer(), nullable=True))
    add_column_if_missing("agreements", sa.Column("fuel_charge_rate", sa.Numeric(12, 2), nullable=True))

    # I6 — vehicle service history
    if table_exists("maintenance_records"):
        return

    op.create_table(
        "maintenance_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column(
            "service_type",
            sa.Enum(
                "ROUTINE_SERVICE", "OIL_CHANGE", "TIRE_REPLACEMENT", "BRAKE_SERVICE",
                "REPAIR", "BODYWORK", "INSPECTION", "OTHER",
                name="maintenancetype",
            ),
            nullable=False,
        ),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("odometer", sa.Integer(), nullable=True),
        sa.Column("cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("provider", sa.String(200), nullable=True),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("next_due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_due_mileage", sa.Integer(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("cost >= 0", name="ck_maintenance_cost_non_negative"),
        sa.CheckConstraint("odometer >= 0", name="ck_maintenance_odometer_non_negative"),
    )
    op.create_index("ix_maintenance_records_vehicle_id", "maintenance_records", ["vehicle_id"])
    op.create_index("ix_maintenance_records_service_type", "maintenance_records", ["service_type"])
    op.create_index("ix_maintenance_records_performed_at", "maintenance_records", ["performed_at"])
    op.create_index("ix_maintenance_records_next_due_date", "maintenance_records", ["next_due_date"])


def downgrade() -> None:
    op.drop_table("maintenance_records")
    with op.batch_alter_table("agreements") as batch_op:
        for col in ("fuel_charge_rate", "fuel_level_in", "fuel_level_out",
                    "excess_mileage_rate", "mileage_limit_per_day"):
            batch_op.drop_column(col)
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_column("monthly_rate")
        batch_op.drop_column("weekly_rate")
