"""Unit tests for ledger balance computation."""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.services import ledger_service


@pytest.fixture
def test_customer(db: Session) -> Customer:
    """Create a test customer."""
    customer = Customer(
        first_name="Test",
        last_name="Customer",
        phone_primary="0911000000",
        id_type="passport",
        id_number="AB123456",
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@pytest.fixture
def test_agreement(db: Session, test_customer: Customer) -> Agreement:
    """Create a test agreement."""
    from datetime import datetime, timezone
    
    agreement = Agreement(
        agreement_number="AGR-TEST-001",
        agreement_type=AgreementType.STANDARD,
        status=AgreementStatus.ACTIVE,
        customer_id=test_customer.id,
        pickup_datetime=datetime.now(timezone.utc),
        expected_return_datetime=datetime.now(timezone.utc),
        agreed_daily_rate=Decimal("1500.00"),
    )
    db.add(agreement)
    db.commit()
    db.refresh(agreement)
    return agreement


class TestGetAgreementBalance:
    """Test balance computation."""

    def test_empty_ledger_zero_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Empty ledger should have zero balance."""
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("0")

    def test_single_charge_positive_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Single charge should result in positive balance."""
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1500.00"),
            description="Rental charge",
        )
        
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("1500.00")

    def test_charge_minus_payment_correct_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Charge minus payment should give correct balance."""
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1500.00"),
            description="Rental charge",
        )
        
        ledger_service.post_payment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
        )
        
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("500.00")

    def test_full_payment_zero_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Full payment should result in zero balance."""
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1500.00"),
            description="Rental charge",
        )
        
        ledger_service.post_payment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1500.00"),
            payment_method=PaymentMethod.CASH,
        )
        
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("0")

    def test_overpayment_negative_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Overpayment should result in negative balance (credit)."""
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1500.00"),
            description="Rental charge",
        )
        
        ledger_service.post_payment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
        )
        
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("-500.00")

    def test_multiple_charges_and_payments(
        self, db: Session, test_agreement: Agreement
    ):
        """Multiple entries should sum correctly."""
        # Initial charge
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("3000.00"),
            description="3-day rental",
        )
        
        # Partial payment
        ledger_service.post_payment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
        )
        
        # Late fee
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("500.00"),
            description="Late fee",
            entry_type=LedgerEntryType.LATE_FEE,
        )
        
        # Final payment
        ledger_service.post_payment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.TELEBIRR,
        )
        
        # Balance: 3000 - 1000 + 500 - 2000 = 500
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("500.00")


class TestPostChargeValidation:
    """Test charge posting validation."""

    def test_zero_charge_rejected(
        self, db: Session, test_agreement: Agreement
    ):
        """Zero amount charge should be rejected."""
        with pytest.raises(Exception):
            ledger_service.post_charge(
                db=db,
                agreement_id=test_agreement.id,
                amount=Decimal("0"),
                description="Invalid charge",
            )

    def test_negative_charge_rejected(
        self, db: Session, test_agreement: Agreement
    ):
        """Negative amount charge should be rejected."""
        with pytest.raises(Exception):
            ledger_service.post_charge(
                db=db,
                agreement_id=test_agreement.id,
                amount=Decimal("-100"),
                description="Invalid charge",
            )


class TestPostPaymentValidation:
    """Test payment posting validation."""

    def test_zero_payment_rejected(
        self, db: Session, test_agreement: Agreement
    ):
        """Zero amount payment should be rejected."""
        with pytest.raises(Exception):
            ledger_service.post_payment(
                db=db,
                agreement_id=test_agreement.id,
                amount=Decimal("0"),
                payment_method=PaymentMethod.CASH,
            )

    def test_negative_payment_rejected(
        self, db: Session, test_agreement: Agreement
    ):
        """Negative amount payment should be rejected."""
        with pytest.raises(Exception):
            ledger_service.post_payment(
                db=db,
                agreement_id=test_agreement.id,
                amount=Decimal("-100"),
                payment_method=PaymentMethod.CASH,
            )


class TestAdjustments:
    """Test adjustment posting."""

    def test_positive_adjustment_increases_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Positive adjustment should increase balance."""
        ledger_service.post_adjustment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("200.00"),
            description="Damage charge adjustment",
        )
        
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("200.00")

    def test_negative_adjustment_decreases_balance(
        self, db: Session, test_agreement: Agreement
    ):
        """Negative adjustment should decrease balance."""
        ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("1000.00"),
            description="Rental",
        )
        
        ledger_service.post_adjustment(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("-100.00"),
            description="Discount",
        )
        
        balance = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance == Decimal("900.00")


class TestReversals:
    """Test entry reversals."""

    def test_reversal_negates_entry(
        self, db: Session, test_agreement: Agreement
    ):
        """Reversal should negate the original entry."""
        entry = ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("500.00"),
            description="Erroneous charge",
        )
        
        balance_before = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance_before == Decimal("500.00")
        
        ledger_service.reverse_entry(
            db=db,
            entry_id=entry.id,
            reason="Entered in error",
        )
        
        balance_after = ledger_service.get_agreement_balance(db, test_agreement.id)
        assert balance_after == Decimal("0")

    def test_double_reversal_rejected(
        self, db: Session, test_agreement: Agreement
    ):
        """Double reversal should be rejected."""
        entry = ledger_service.post_charge(
            db=db,
            agreement_id=test_agreement.id,
            amount=Decimal("500.00"),
            description="Test charge",
        )
        
        ledger_service.reverse_entry(db=db, entry_id=entry.id, reason="First reversal")
        
        with pytest.raises(Exception):
            ledger_service.reverse_entry(db=db, entry_id=entry.id, reason="Second reversal")
