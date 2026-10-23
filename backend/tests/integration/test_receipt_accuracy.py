"""A receipt must report a real payment and the same balance as the screen.

The generator selected any ledger row with a negative amount, so a -300
discount was issued as a 300 payment receipt, and it took the balance from
the signed row sum, which nets the held deposit off and read 5,000 low.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.core.errors import BusinessError
from src.models.ledger_entry import PaymentMethod
from src.services import agreement_service, ledger_service, printing_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


@pytest.fixture
def agreement(db: Session, test_customer, test_vehicle):
    pickup = datetime.now(timezone.utc) + timedelta(days=3)
    ag = agreement_service.create_standard_agreement(
        db=db,
        customer_id=test_customer.id,
        vehicle_id=test_vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=3),
        daily_rate=Decimal("1500.00"),
        deposit_amount=Decimal("5000.00"),
    )
    ledger_service.post_deposit(
        db, ag.id, amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH
    )
    return ag


def read(path: str) -> str:
    with open(path) as handle:
        return handle.read()


class TestOnlyRealPaymentsAreReceipted:
    def test_a_discount_is_not_treated_as_a_payment(self, db: Session, agreement):
        # The exact shape QA hit: a negative adjustment and no real payment.
        ledger_service.post_adjustment(
            db, agreement.id, amount=Decimal("-300.00"), description="QA UI discount"
        )

        with pytest.raises(BusinessError, match="No payment"):
            printing_service.generate_receipt(db, agreement.id)

    def test_a_held_deposit_is_not_treated_as_a_payment(self, db: Session, agreement):
        with pytest.raises(BusinessError, match="No payment"):
            printing_service.generate_receipt(db, agreement.id)

    def test_a_reversed_payment_cannot_be_receipted(self, db: Session, agreement):
        """QA's agreement 20: its only payment had been reversed."""
        payment = ledger_service.post_payment(
            db, agreement.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
        )
        ledger_service.reverse_entry(db, entry_id=payment.id, reason="Posted in error")

        with pytest.raises(BusinessError, match="No payment"):
            printing_service.generate_receipt(db, agreement.id)

    def test_a_real_payment_is_receipted(self, db: Session, agreement):
        ledger_service.post_payment(
            db, agreement.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
        )

        result = printing_service.generate_receipt(db, agreement.id)
        text = read(result["filepath"])

        assert "3,000.00" in text
        assert "cash" in text.lower()

    def test_naming_a_non_payment_entry_is_refused(self, db: Session, agreement):
        adjustment = ledger_service.post_adjustment(
            db, agreement.id, amount=Decimal("-300.00"), description="QA UI discount"
        )
        ledger_service.post_payment(
            db, agreement.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
        )

        with pytest.raises(BusinessError, match="not a payment"):
            printing_service.generate_receipt(db, agreement.id, payment_id=adjustment.id)


class TestBalanceMatchesTheRestOfTheSystem:
    def test_receipt_balance_equals_balance_due(self, db: Session, agreement):
        ledger_service.post_payment(
            db, agreement.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
        )

        breakdown = agreement_service.get_balance_breakdown(db, agreement.id)
        expected = f"{breakdown['balance_due']:,.2f}"

        text = read(printing_service.generate_receipt(db, agreement.id)["filepath"])
        assert expected in text

    def test_the_held_deposit_is_not_subtracted(self, db: Session, agreement):
        """The old formula netted the 5,000 deposit off the printed balance."""
        ledger_service.post_payment(
            db, agreement.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
        )

        breakdown = agreement_service.get_balance_breakdown(db, agreement.id)
        text = read(printing_service.generate_receipt(db, agreement.id)["filepath"])

        wrong = breakdown["balance_due"] - Decimal("5000.00")
        assert f"{wrong:,.2f}" not in text


class TestDocumentFormatting:
    def test_a_utc_timestamp_prints_as_local_time(self):
        """A payment taken at 11:38 in Addis printed as 08:38 — the raw UTC."""
        from src.services.printing_service import format_datetime

        utc = datetime(2026, 9, 24, 8, 38, tzinfo=timezone.utc)
        assert format_datetime(utc) == "September 24, 2026 at 11:38 AM"

    def test_a_naive_timestamp_is_treated_as_utc(self):
        from src.services.printing_service import format_datetime

        assert format_datetime(datetime(2026, 9, 24, 8, 38)) == "September 24, 2026 at 11:38 AM"

    def test_payment_methods_read_as_words(self):
        from src.models.ledger_entry import PaymentMethod
        from src.services.printing_service import format_payment_method

        assert format_payment_method(PaymentMethod.BANK_TRANSFER) == "Bank Transfer"
        assert format_payment_method(PaymentMethod.TELEBIRR) == "TeleBirr"
        assert format_payment_method(None) == "N/A"

    def test_the_receipt_spells_out_the_method(self, db: Session, agreement):
        from src.models.ledger_entry import PaymentMethod

        ledger_service.post_payment(
            db,
            agreement.id,
            amount=Decimal("2500.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
            payment_reference="QA-REF-77",
        )

        text = read(printing_service.generate_receipt(db, agreement.id)["filepath"])
        assert "Bank Transfer" in text
        assert "bank_transfer" not in text
        assert "QA-REF-77" in text


class TestErrorStatusCodes:
    def test_no_payment_returns_400_not_500(self, client, agreement, auth_headers):
        """The catch-all rewrapped a deliberate 400 as a 500."""
        r = client.post(
            f"/api/documents/agreements/{agreement.id}/receipt", headers=auth_headers
        )
        assert r.status_code == 400, r.text
        assert "No payment" in r.json()["detail"]
        # The old response nested the real status inside the message.
        assert "500" not in r.json()["detail"]
