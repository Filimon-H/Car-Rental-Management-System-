"""Reversed entries must drop out of every balance aggregate.

The ledger is append-only: reversing adds a REVERSAL row with the opposite
amount. The balance (a signed sum of everything) nets out on its own, but the
breakdown helpers filter by entry_type — which excludes REVERSAL — so a reversed
charge used to stay in total_charges and be billed to the customer.
"""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.ledger_entry import LedgerEntry, LedgerEntryType
from src.services import ledger_service
from src.services.agreement_service import _calculate_balance_breakdown


def _add(db: Session, agreement_id: int, entry_type: LedgerEntryType, amount: str) -> LedgerEntry:
    entry = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=entry_type,
        amount=Decimal(amount),
        description=f"{entry_type.value} {amount}",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


class TestReversedChargesAreNotBilled:
    def test_reversed_charge_leaves_nothing_owed(self, db: Session):
        """The original defect: a charge raised in error and reversed."""
        charge = _add(db, 5001, LedgerEntryType.CHARGE, "5000")
        ledger_service.reverse_entry(db=db, entry_id=charge.id, reason="Billing error")

        breakdown = _calculate_balance_breakdown(db, 5001)

        assert breakdown["total_charges"] == Decimal("0")
        assert breakdown["balance_due"] == Decimal("0")
        assert ledger_service.get_agreement_balance(db, 5001) == Decimal("0")

    def test_unreversed_charge_is_still_billed(self, db: Session):
        """Control: the guard must not swallow legitimate charges."""
        _add(db, 5002, LedgerEntryType.CHARGE, "3000")

        breakdown = _calculate_balance_breakdown(db, 5002)

        assert breakdown["total_charges"] == Decimal("3000")
        assert breakdown["balance_due"] == Decimal("3000")

    def test_only_the_reversed_charge_drops_out(self, db: Session):
        """Two charges, one reversed — the other must survive."""
        kept = _add(db, 5003, LedgerEntryType.CHARGE, "2000")
        undone = _add(db, 5003, LedgerEntryType.CHARGE, "7000")
        ledger_service.reverse_entry(db=db, entry_id=undone.id, reason="Duplicate")

        breakdown = _calculate_balance_breakdown(db, 5003)

        assert breakdown["total_charges"] == Decimal("2000")
        assert breakdown["balance_due"] == Decimal("2000")
        assert kept.id is not None

    def test_reversal_does_not_leak_across_agreements(self, db: Session):
        """A reversal on one agreement must not affect another."""
        _add(db, 5004, LedgerEntryType.CHARGE, "1000")
        other = _add(db, 5005, LedgerEntryType.CHARGE, "9000")
        ledger_service.reverse_entry(db=db, entry_id=other.id, reason="Wrong customer")

        assert _calculate_balance_breakdown(db, 5004)["total_charges"] == Decimal("1000")
        assert _calculate_balance_breakdown(db, 5005)["total_charges"] == Decimal("0")


class TestReversedPaymentsAndDeposits:
    def test_reversed_payment_restores_the_debt(self, db: Session):
        """A bounced payment must leave the customer owing again."""
        _add(db, 5006, LedgerEntryType.CHARGE, "4000")
        payment = _add(db, 5006, LedgerEntryType.PAYMENT, "-4000")
        ledger_service.reverse_entry(db=db, entry_id=payment.id, reason="Cheque bounced")

        breakdown = _calculate_balance_breakdown(db, 5006)

        assert breakdown["total_payments"] == Decimal("0")
        assert breakdown["balance_due"] == Decimal("4000")

    def test_reversed_deposit_is_not_counted_as_held(self, db: Session):
        deposit = _add(db, 5007, LedgerEntryType.DEPOSIT, "-2000")
        ledger_service.reverse_entry(db=db, entry_id=deposit.id, reason="Recorded in error")

        breakdown = _calculate_balance_breakdown(db, 5007)

        assert breakdown["deposit_received"] == Decimal("0")
        assert breakdown["deposit_held"] == Decimal("0")

    def test_reversed_adjustment_drops_out(self, db: Session):
        adjustment = _add(db, 5008, LedgerEntryType.ADJUSTMENT, "500")
        ledger_service.reverse_entry(db=db, entry_id=adjustment.id, reason="Applied twice")

        assert ledger_service.get_net_adjustments(db, 5008) == Decimal("0")


class TestBreakdownAgreesWithBalance:
    def test_breakdown_and_signed_balance_stay_consistent(self, db: Session):
        """The two calculations disagreeing is what made this bug invisible."""
        charge = _add(db, 5009, LedgerEntryType.CHARGE, "6000")
        _add(db, 5009, LedgerEntryType.PAYMENT, "-1000")
        ledger_service.reverse_entry(db=db, entry_id=charge.id, reason="Rebooked")

        breakdown = _calculate_balance_breakdown(db, 5009)
        signed_balance = ledger_service.get_agreement_balance(db, 5009)

        # Charges gone, one payment stands: the customer is 1000 in credit.
        assert breakdown["total_charges"] == Decimal("0")
        assert breakdown["total_payments"] == Decimal("1000")
        assert signed_balance == Decimal("-1000")
        # balance_due floors at zero — a credit is not a debt.
        assert breakdown["balance_due"] == Decimal("0")
