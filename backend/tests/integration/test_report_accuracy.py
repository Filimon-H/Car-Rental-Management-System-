"""Reports must reconcile with the ledger screen.

Section 6 requires the exported figures and the on-screen ledger to match
exactly, so these assert against the same balance helper the UI reads.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.ledger_entry import PaymentMethod
from src.services import agreement_service, ledger_service, report_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


@pytest.fixture
def agreement(db: Session, test_customer, test_vehicle):
    """A rental with a held deposit, a live payment and a reversed one."""
    pickup = datetime.now(timezone.utc) + timedelta(days=3)
    ag = agreement_service.create_standard_agreement(
        db=db,
        customer_id=test_customer.id,
        vehicle_id=test_vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=10),
        daily_rate=Decimal("1500.00"),
        deposit_amount=Decimal("5000.00"),
    )
    ledger_service.post_deposit(
        db, ag.id, amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH
    )
    reversed_payment = ledger_service.post_payment(
        db, ag.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
    )
    ledger_service.reverse_entry(db, entry_id=reversed_payment.id, reason="Posted in error")
    ledger_service.post_payment(
        db, ag.id, amount=Decimal("2500.00"), payment_method=PaymentMethod.BANK_TRANSFER
    )
    return ag


def last_running_balance(csv_text: str) -> Decimal:
    rows = [r for r in csv_text.strip().split("\n")[1:] if r.strip()]
    return Decimal(rows[-1].split(",")[4])


class TestLedgerCsvMatchesTheScreen:
    def test_final_running_balance_equals_balance_due(self, db: Session, agreement):
        """The CSV subtracted the held deposit, reading 5,000 low."""
        _, csv_text = report_service.agreement_ledger_csv(db, agreement.id)

        expected = agreement_service.get_balance_breakdown(db, agreement.id)["balance_due"]
        assert last_running_balance(csv_text) == expected

    def test_a_held_deposit_does_not_reduce_the_running_balance(self, db: Session, agreement):
        _, csv_text = report_service.agreement_ledger_csv(db, agreement.id)
        breakdown = agreement_service.get_balance_breakdown(db, agreement.id)

        wrong = breakdown["balance_due"] - Decimal("5000.00")
        assert last_running_balance(csv_text) != wrong

    def test_an_applied_deposit_does_reduce_it(self, db: Session, agreement):
        before = last_running_balance(report_service.agreement_ledger_csv(db, agreement.id)[1])

        ledger_service.apply_deposit(db, agreement.id, amount=Decimal("1000.00"))

        after = last_running_balance(report_service.agreement_ledger_csv(db, agreement.id)[1])
        assert before - after == Decimal("1000.00")


class TestRevenueExcludesReversedEntries:
    def test_a_reversed_payment_is_not_collected_revenue(self, db: Session, agreement):
        """3,000 was reversed; only the 2,500 stands."""
        start = datetime.now(timezone.utc) - timedelta(days=1)
        end = datetime.now(timezone.utc) + timedelta(days=1)

        report = report_service.revenue_summary(db, start, end)
        assert Decimal(str(report["payments_collected"])) == Decimal("2500.00")

    def test_a_reversal_row_is_not_added_to_revenue(self, db: Session, agreement):
        start = datetime.now(timezone.utc) - timedelta(days=1)
        end = datetime.now(timezone.utc) + timedelta(days=1)

        report = report_service.revenue_summary(db, start, end)

        # net_revenue previously added the +3,000 reversal on top of charges.
        gross = Decimal(str(report["gross_charges"]))
        adjustments = Decimal(str(report["adjustments"]))
        assert Decimal(str(report["net_revenue"])) == gross + adjustments


class TestFleetUtilisation:
    def test_a_rental_inside_the_window_is_counted(self, db: Session, test_customer, test_vehicle):
        pickup = datetime.now(timezone.utc) + timedelta(days=2)
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=10),
            daily_rate=Decimal("1500.00"),
        )

        _, csv_text = report_service.fleet_utilization_csv(
            db, pickup - timedelta(days=1), pickup + timedelta(days=20)
        )
        row = csv_text.strip().split("\n")[1].split(",")
        assert Decimal(row[4]) == Decimal("10.0")  # days rented
        assert Decimal(row[7]) == 1  # agreements

    def test_a_window_with_no_overlap_is_legitimately_zero(
        self, db: Session, test_customer, test_vehicle
    ):
        """QA read all-zero rows as a bug; a non-overlapping window is simply empty."""
        pickup = datetime.now(timezone.utc) + timedelta(days=40)
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=5),
            daily_rate=Decimal("1500.00"),
        )

        _, csv_text = report_service.fleet_utilization_csv(
            db, datetime.now(timezone.utc), datetime.now(timezone.utc) + timedelta(days=10)
        )
        row = csv_text.strip().split("\n")[1].split(",")
        assert Decimal(row[4]) == Decimal("0.0")
