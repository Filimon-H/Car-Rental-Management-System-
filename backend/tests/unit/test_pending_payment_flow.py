"""The pending -> deposit -> payment -> activate path must work end to end."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import AgreementStatus
from src.models.ledger_entry import PaymentMethod
from src.models.vehicle import VehicleStatus
from src.services import agreement_service, ledger_service

from tests.unit.test_agreement_service import customer, vehicle  # noqa: F401


@pytest.fixture
def pending(db: Session, customer, vehicle):
    pickup = datetime.now(timezone.utc) + timedelta(days=3)
    return agreement_service.create_standard_agreement(
        db=db,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=3),
        daily_rate=Decimal("1200.00"),
        deposit_amount=Decimal("5000.00"),
    )


def test_deposit_can_be_received_while_pending(db: Session, pending):
    # This is the step the UI made unreachable.
    assert pending.status == AgreementStatus.PENDING_PAYMENT
    ledger_service.post_deposit(
        db, pending.id, amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH
    )
    summary = agreement_service.get_agreement_summary(db, pending.id)
    assert summary["deposit_held"] == Decimal("5000.00")


def test_payment_can_be_posted_while_pending(db: Session, pending):
    ledger_service.post_payment(
        db, pending.id, amount=Decimal("1000.00"), payment_method=PaymentMethod.CASH
    )
    summary = agreement_service.get_agreement_summary(db, pending.id)
    assert summary["total_payments"] == Decimal("1000.00")


def test_activation_succeeds_once_the_deposit_is_in(db: Session, pending, vehicle):
    ledger_service.post_deposit(
        db, pending.id, amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH
    )
    activated = agreement_service.activate_agreement(db, pending.id)
    assert activated.status == AgreementStatus.ACTIVE
    db.refresh(vehicle)
    assert vehicle.status == VehicleStatus.RENTED


def test_activation_without_the_deposit_is_refused(db: Session, pending):
    from src.core.errors import BusinessError

    with pytest.raises(BusinessError, match="deposit"):
        agreement_service.activate_agreement(db, pending.id)
