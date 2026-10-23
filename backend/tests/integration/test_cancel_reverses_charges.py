"""Cancelling an unpaid booking must not leave a balance standing.

An approved booking carries a posted rental charge. Cancelling it changed
the status and released the vehicle but never touched the ledger, so the
customer's own My Bookings card, the admin header tiles and the API all kept
reporting a balance due on a rental that will never happen — with no Reverse
action on the row for staff to clear it.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import AgreementStatus
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service, ledger_service

from tests.integration.test_extend_booking import (  # noqa: F401
    customer,
    customer_headers,
    customer_user,
)


@pytest.fixture
def vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="CAN-0001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1100.00"),
        weekly_rate=Decimal("6500.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def approved(db: Session, customer, vehicle) -> object:
    """An approved booking with a rental charge posted and nothing paid."""
    pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
    agreement = agreement_service.create_standard_agreement(
        db=db,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=7),
        daily_rate=vehicle.daily_rate,
    )
    # create_standard_agreement already posts the rental charge, which is
    # what approval does in production.
    agreement.status = AgreementStatus.PENDING_PAYMENT
    db.commit()
    db.refresh(agreement)
    return agreement


class TestCancellingAnUnpaidBookingClearsTheBalance:
    def test_the_balance_is_zero_after_cancelling(
        self, db: Session, approved
    ):
        agreement_service.cancel_agreement(db, approved.id)

        breakdown = agreement_service.get_balance_breakdown(db, approved.id)
        assert breakdown["balance_due"] == Decimal("0"), (
            f"cancelled booking still owes {breakdown['balance_due']}"
        )

    def test_the_customer_sees_no_balance(
        self, client, db: Session, customer_headers, approved
    ):
        agreement_service.cancel_agreement(db, approved.id)

        r = client.get("/api/public/bookings", headers=customer_headers)
        assert r.status_code == 200, r.text
        row = next(b for b in r.json() if b["id"] == approved.id)
        assert row["status"] == "cancelled"
        assert Decimal(row["balance_due"]) == Decimal("0"), row

    def test_the_charge_is_reversed_not_deleted(
        self, db: Session, approved
    ):
        """The ledger is append-only: the original must survive."""
        original = (
            db.query(LedgerEntry)
            .filter(
                LedgerEntry.agreement_id == approved.id,
                LedgerEntry.entry_type == LedgerEntryType.CHARGE,
            )
            .one()
        )

        agreement_service.cancel_agreement(db, approved.id)

        assert db.query(LedgerEntry).filter(LedgerEntry.id == original.id).one()
        reversal = (
            db.query(LedgerEntry)
            .filter(LedgerEntry.reversed_entry_id == original.id)
            .one()
        )
        assert reversal.entry_type == LedgerEntryType.REVERSAL
        assert reversal.amount == -original.amount

    def test_a_booking_request_is_also_left_at_zero(
        self, db: Session, customer, vehicle
    ):
        """QA saw 0/0/0 here already; it must stay that way."""
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=vehicle.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        agreement_service.cancel_agreement(db, agreement.id)
        breakdown = agreement_service.get_balance_breakdown(db, agreement.id)
        assert breakdown["balance_due"] == Decimal("0")


class TestAPaidBookingIsNotSilentlyCleared:
    def test_a_payment_leaves_the_charge_standing_for_staff(
        self, db: Session, approved
    ):
        """Money has changed hands: a refund is a decision, not a side effect.

        Reversing the charge here would erase the record of what the customer
        owed against what they paid, turning a refund into a silent write-off.
        """
        ledger_service.post_payment(
            db=db,
            agreement_id=approved.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.CASH,
            description="Part payment",
        )

        agreement_service.cancel_agreement(db, approved.id)

        breakdown = agreement_service.get_balance_breakdown(db, approved.id)
        assert breakdown["total_charges"] > Decimal("0"), (
            "a paid booking's charges were reversed automatically"
        )
