"""Add CHECK constraints for money and date invariants

Revision ID: j6e7f8a9b0c1
Revises: i5d6e7f8a9b0
Create Date: 2026-09-18

SQLite cannot ALTER TABLE ADD CONSTRAINT, so each table is rebuilt via batch mode.
"""
from alembic import op

revision = "j6e7f8a9b0c1"
down_revision = "i5d6e7f8a9b0"
branch_labels = None
depends_on = None


CONSTRAINTS = {
    "vehicles": [
        ("ck_vehicles_daily_rate_non_negative", "daily_rate >= 0"),
        ("ck_vehicles_mileage_non_negative", "current_mileage >= 0"),
        ("ck_vehicles_year_sane", "year >= 1900"),
        ("ck_vehicles_seats_positive", "seats > 0"),
    ],
    "agreements": [
        ("ck_agreements_rate_non_negative", "agreed_daily_rate >= 0"),
        ("ck_agreements_deposit_non_negative", "deposit_amount >= 0"),
        ("ck_agreements_advance_non_negative", "advance_payment IS NULL OR advance_payment >= 0"),
        ("ck_agreements_return_after_pickup", "expected_return_datetime > pickup_datetime"),
    ],
    "vendors": [
        ("ck_vendors_commission_rate_percentage", "commission_rate >= 0 AND commission_rate <= 100"),
    ],
    "agreement_vehicle_segments": [
        ("ck_segments_rate_non_negative", "daily_rate >= 0"),
        ("ck_segments_end_after_start", "end_datetime > start_datetime"),
    ],
}


def upgrade() -> None:
    for table, constraints in CONSTRAINTS.items():
        with op.batch_alter_table(table) as batch_op:
            for name, condition in constraints:
                batch_op.create_check_constraint(name, condition)


def downgrade() -> None:
    for table, constraints in CONSTRAINTS.items():
        with op.batch_alter_table(table) as batch_op:
            for name, _ in constraints:
                batch_op.drop_constraint(name, type_="check")
