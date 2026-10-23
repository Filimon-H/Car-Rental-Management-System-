"""What a customer sees must match what staff see.

/api/public/bookings had its own copy of the balance formula. It happened to
agree, because get_total_charges already folds ADJUSTMENT into charges — but
a sixth duplicate of this calculation is how the dashboard, the ledger CSV
and the receipt each drifted in turn. These pin the customer-facing figure
to the shared breakdown so it cannot.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.ledger_entry import PaymentMethod
from src.services import agreement_service, ledger_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


@pytest.fixture
def discounted_agreement(db: Session, test_customer, test_vehicle):
    pickup = datetime.now(timezone.utc) + timedelta(days=3)
    ag = agreement_service.create_standard_agreement(
        db=db,
        customer_id=test_customer.id,
        vehicle_id=test_vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=9),
        daily_rate=Decimal("1500.00"),
    )
    ledger_service.post_payment(
        db, ag.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
    )
    # Net -600, exactly what the old formula dropped.
    ledger_service.post_adjustment(
        db, ag.id, amount=Decimal("-500.00"), description="Goodwill discount"
    )
    ledger_service.post_adjustment(
        db, ag.id, amount=Decimal("-100.00"), description="Second discount"
    )
    return ag


class TestPublicBalanceMatchesStaff:
    def test_a_discount_reaches_the_customer_facing_balance(
        self, db: Session, discounted_agreement
    ):
        from src.api.routers.public import _agreement_to_response  # noqa: PLC0415

        shared = agreement_service.get_balance_breakdown(db, discounted_agreement.id)
        assert shared["net_adjustments"] == Decimal("-600.00")

        booking = _agreement_to_response(discounted_agreement, db=db)
        assert Decimal(str(booking.balance_due)) == shared["balance_due"]

    def test_the_discount_is_actually_deducted(self, db: Session, discounted_agreement):
        """13,500 charged - 600 discount - 3,000 paid = 9,900."""
        from src.api.routers.public import _agreement_to_response  # noqa: PLC0415

        booking = _agreement_to_response(discounted_agreement, db=db)
        assert Decimal(str(booking.balance_due)) == Decimal("9900.00")

    def test_a_reversed_payment_is_still_excluded(self, db: Session, discounted_agreement):
        """get_total_payments already skipped reversals; confirm that survives."""
        from src.api.routers.public import _agreement_to_response  # noqa: PLC0415

        before = Decimal(str(_agreement_to_response(discounted_agreement, db=db).balance_due))

        extra = ledger_service.post_payment(
            db, discounted_agreement.id, amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
        )
        ledger_service.reverse_entry(db, entry_id=extra.id, reason="Posted in error")

        after = Decimal(str(_agreement_to_response(discounted_agreement, db=db).balance_due))
        assert after == before
