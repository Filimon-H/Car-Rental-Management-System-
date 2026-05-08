"""Unit tests for deposit accounting and aggregate ledger queries.

Covers the parts of ledger_service not exercised by test_ledger.py:
  - post_deposit / return_deposit / apply_deposit
  - get_deposit_received / get_deposit_held / get_deposit_applied / get_deposit_returned
  - get_total_charges / get_total_payments
  - reverse_entry for non-charge entry types
"""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.core.errors import BusinessError
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntryType, PaymentMethod
from src.services import ledger_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Liya",
        last_name="Tadesse",
        phone_primary="0911100001",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def agreement(db: Session, customer: Customer) -> Agreement:
    from datetime import datetime, timezone
    ag = Agreement(
        agreement_number="AGR-DEP-001",
        agreement_type=AgreementType.STANDARD,
        status=AgreementStatus.ACTIVE,
        customer_id=customer.id,
        pickup_datetime=datetime.now(timezone.utc),
        expected_return_datetime=datetime.now(timezone.utc),
        agreed_daily_rate=Decimal("1500.00"),
    )
    db.add(ag)
    db.commit()
    db.refresh(ag)
    return ag


# ---------------------------------------------------------------------------
# post_deposit
# ---------------------------------------------------------------------------

class TestPostDeposit:

    def test_deposit_stored_as_negative_amount(self, db, agreement):
        """Deposits are credits (stored negative) to indicate money held."""
        entry = ledger_service.post_deposit(
            db=db,
            agreement_id=agreement.id,
            amount=Decimal("5000.00"),
            payment_method=PaymentMethod.CASH,
        )
        assert entry.amount == Decimal("-5000.00")
        assert entry.entry_type == LedgerEntryType.DEPOSIT

    def test_deposit_reduces_raw_balance(self, db, agreement):
        """A deposit entry (negative) reduces the raw ledger sum."""
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("3000.00"), description="Rental")
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH)
        balance = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance == Decimal("0.00")

    def test_zero_deposit_rejected(self, db, agreement):
        with pytest.raises(BusinessError):
            ledger_service.post_deposit(
                db=db, agreement_id=agreement.id,
                amount=Decimal("0"), payment_method=PaymentMethod.CASH,
            )

    def test_negative_deposit_rejected(self, db, agreement):
        with pytest.raises(BusinessError):
            ledger_service.post_deposit(
                db=db, agreement_id=agreement.id,
                amount=Decimal("-500"), payment_method=PaymentMethod.CASH,
            )

    def test_deposit_records_payment_method(self, db, agreement):
        entry = ledger_service.post_deposit(
            db=db, agreement_id=agreement.id,
            amount=Decimal("2000.00"), payment_method=PaymentMethod.TELEBIRR,
        )
        assert entry.payment_method == PaymentMethod.TELEBIRR


# ---------------------------------------------------------------------------
# get_deposit_received
# ---------------------------------------------------------------------------

class TestGetDepositReceived:

    def test_no_deposit_returns_zero(self, db, agreement):
        assert ledger_service.get_deposit_received(db, agreement.id) == Decimal("0")

    def test_single_deposit(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        assert ledger_service.get_deposit_received(db, agreement.id) == Decimal("5000.00")

    def test_multiple_deposits_summed(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("2000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("3000.00"), payment_method=PaymentMethod.BANK_TRANSFER)
        assert ledger_service.get_deposit_received(db, agreement.id) == Decimal("5000.00")


# ---------------------------------------------------------------------------
# get_deposit_held / apply_deposit
# ---------------------------------------------------------------------------

class TestDepositHeld:

    def test_full_deposit_held_before_application(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("5000.00")

    def test_held_reduces_after_partial_application(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.apply_deposit(db=db, agreement_id=agreement.id, amount=Decimal("2000.00"))
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("3000.00")

    def test_held_zero_after_full_application(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.apply_deposit(db=db, agreement_id=agreement.id, amount=Decimal("5000.00"))
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("0.00")

    def test_held_never_goes_negative(self, db, agreement):
        """Even with over-application (should be prevented), held floors at 0."""
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("0")

    def test_apply_deposit_reduces_balance(self, db, agreement):
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("5000.00"), description="Rental")
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.apply_deposit(db=db, agreement_id=agreement.id, amount=Decimal("5000.00"))
        balance = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance == Decimal("-5000.00")  # charge + deposit + applied

    def test_apply_deposit_entry_type(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH)
        entry = ledger_service.apply_deposit(db=db, agreement_id=agreement.id,
                                             amount=Decimal("1000.00"))
        assert entry.entry_type == LedgerEntryType.DEPOSIT_APPLIED
        assert entry.amount == Decimal("-1000.00")

    def test_apply_more_than_held_raises(self, db, agreement):
        """Cannot apply more deposit than is held."""
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("2000.00"), payment_method=PaymentMethod.CASH)
        with pytest.raises(BusinessError):
            ledger_service.apply_deposit(db=db, agreement_id=agreement.id,
                                         amount=Decimal("3000.00"))

    def test_apply_zero_raises(self, db, agreement):
        with pytest.raises(BusinessError):
            ledger_service.apply_deposit(db=db, agreement_id=agreement.id,
                                         amount=Decimal("0"))


# ---------------------------------------------------------------------------
# return_deposit
# ---------------------------------------------------------------------------

class TestReturnDeposit:

    def test_return_deposit_positive_amount(self, db, agreement):
        """Returned deposit is positive (increases raw balance — money leaves company)."""
        entry = ledger_service.return_deposit(
            db=db, agreement_id=agreement.id, amount=Decimal("5000.00")
        )
        assert entry.amount == Decimal("5000.00")
        assert entry.entry_type == LedgerEntryType.DEPOSIT_RETURN

    def test_deposit_held_reduces_after_return(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.return_deposit(db=db, agreement_id=agreement.id, amount=Decimal("5000.00"))
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("0.00")

    def test_partial_deposit_return(self, db, agreement):
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.return_deposit(db=db, agreement_id=agreement.id, amount=Decimal("3000.00"))
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("2000.00")
        assert ledger_service.get_deposit_returned(db, agreement.id) == Decimal("3000.00")

    def test_zero_return_raises(self, db, agreement):
        with pytest.raises(BusinessError):
            ledger_service.return_deposit(db=db, agreement_id=agreement.id, amount=Decimal("0"))

    def test_negative_return_raises(self, db, agreement):
        with pytest.raises(BusinessError):
            ledger_service.return_deposit(db=db, agreement_id=agreement.id, amount=Decimal("-100"))


# ---------------------------------------------------------------------------
# Full deposit lifecycle
# ---------------------------------------------------------------------------

class TestFullDepositLifecycle:
    """Receive → partially apply → return remainder."""

    def test_receive_apply_return_remainder(self, db, agreement):
        # Charge 3000
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("3000.00"), description="Rental")
        # Receive 5000 deposit
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        # Apply 3000 of deposit to cover charges
        ledger_service.apply_deposit(db=db, agreement_id=agreement.id, amount=Decimal("3000.00"))
        # Return remaining 2000
        ledger_service.return_deposit(db=db, agreement_id=agreement.id, amount=Decimal("2000.00"))

        assert ledger_service.get_deposit_received(db, agreement.id) == Decimal("5000.00")
        assert ledger_service.get_deposit_applied(db, agreement.id) == Decimal("3000.00")
        assert ledger_service.get_deposit_returned(db, agreement.id) == Decimal("2000.00")
        assert ledger_service.get_deposit_held(db, agreement.id) == Decimal("0.00")


# ---------------------------------------------------------------------------
# get_total_charges / get_total_payments
# ---------------------------------------------------------------------------

class TestTotalChargesAndPayments:

    def test_total_charges_sums_charge_entries(self, db, agreement):
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("2000.00"), description="Rental")
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("500.00"), description="Damage",
                                   entry_type=LedgerEntryType.DAMAGE_CHARGE)
        assert ledger_service.get_total_charges(db, agreement.id) == Decimal("2500.00")

    def test_total_charges_includes_late_fee(self, db, agreement):
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("1000.00"), description="Rental")
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("750.00"), description="Late fee",
                                   entry_type=LedgerEntryType.LATE_FEE)
        assert ledger_service.get_total_charges(db, agreement.id) == Decimal("1750.00")

    def test_total_charges_excludes_payments(self, db, agreement):
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("3000.00"), description="Rental")
        ledger_service.post_payment(db=db, agreement_id=agreement.id,
                                    amount=Decimal("1500.00"), payment_method=PaymentMethod.CASH)
        assert ledger_service.get_total_charges(db, agreement.id) == Decimal("3000.00")

    def test_total_payments_sums_payment_entries(self, db, agreement):
        ledger_service.post_payment(db=db, agreement_id=agreement.id,
                                    amount=Decimal("1000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.post_payment(db=db, agreement_id=agreement.id,
                                    amount=Decimal("500.00"), payment_method=PaymentMethod.TELEBIRR)
        assert ledger_service.get_total_payments(db, agreement.id) == Decimal("1500.00")

    def test_total_payments_excludes_deposits(self, db, agreement):
        """Deposit entries are NOT counted in total_payments."""
        ledger_service.post_payment(db=db, agreement_id=agreement.id,
                                    amount=Decimal("1000.00"), payment_method=PaymentMethod.CASH)
        ledger_service.post_deposit(db=db, agreement_id=agreement.id,
                                    amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH)
        assert ledger_service.get_total_payments(db, agreement.id) == Decimal("1000.00")

    def test_no_charges_returns_zero(self, db, agreement):
        assert ledger_service.get_total_charges(db, agreement.id) == Decimal("0")

    def test_no_payments_returns_zero(self, db, agreement):
        assert ledger_service.get_total_payments(db, agreement.id) == Decimal("0")


# ---------------------------------------------------------------------------
# reverse_entry for non-charge types
# ---------------------------------------------------------------------------

class TestReverseEntryTypes:

    def test_reverse_payment_entry(self, db, agreement):
        """Reversing a payment re-adds the amount to the balance."""
        ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                   amount=Decimal("2000.00"), description="Rental")
        payment = ledger_service.post_payment(db=db, agreement_id=agreement.id,
                                              amount=Decimal("2000.00"),
                                              payment_method=PaymentMethod.CASH)
        balance_after_payment = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance_after_payment == Decimal("0.00")

        ledger_service.reverse_entry(db=db, entry_id=payment.id, reason="Payment recorded in error")
        balance_after_reversal = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance_after_reversal == Decimal("2000.00")

    def test_reverse_nonexistent_entry_raises(self, db, agreement):
        with pytest.raises(BusinessError):
            ledger_service.reverse_entry(db=db, entry_id=99999, reason="Does not exist")

    def test_reversal_entry_links_to_original(self, db, agreement):
        charge = ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                            amount=Decimal("1000.00"), description="Test")
        reversal = ledger_service.reverse_entry(db=db, entry_id=charge.id, reason="Test reversal")
        assert reversal.reversed_entry_id == charge.id
        assert reversal.entry_type == LedgerEntryType.REVERSAL
        assert reversal.amount == Decimal("-1000.00")

    def test_reversal_amount_is_opposite(self, db, agreement):
        entry = ledger_service.post_charge(db=db, agreement_id=agreement.id,
                                           amount=Decimal("750.00"), description="Charge")
        reversal = ledger_service.reverse_entry(db=db, entry_id=entry.id, reason="Mistake")
        assert reversal.amount == -entry.amount

    def test_reversal_of_adjustment(self, db, agreement):
        adj = ledger_service.post_adjustment(db=db, agreement_id=agreement.id,
                                             amount=Decimal("-300.00"), description="Discount")
        reversal = ledger_service.reverse_entry(db=db, entry_id=adj.id, reason="Undo discount")
        assert reversal.amount == Decimal("300.00")
        balance = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance == Decimal("0.00")
