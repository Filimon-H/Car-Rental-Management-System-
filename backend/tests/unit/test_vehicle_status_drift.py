"""Regression coverage for shared vehicle ownership across agreements."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from tests.unit.test_agreement_service import customer, second_vehicle, vehicle  # noqa: F401
from src.models.agreement import AgreementStatus
from src.models.inspection import Inspection
from src.models.vehicle import VehicleStatus
from src.services import agreement_service, inspection_service, wedding_agreement_service


def wedding(db, customer, vehicle, offset=1):
    """Build a wedding agreement whose rental starts `offset` days from now.

    create_wedding_agreement rightly refuses a start date in the past, so a
    past offset is applied by backdating the stored rows after creation —
    that models an agreement made earlier whose pickup has since come around,
    which is the only way to reach the already-picked-up scenarios below.
    """
    requested = datetime.now(timezone.utc) + timedelta(days=offset)
    start = requested if offset > 0 else datetime.now(timezone.utc) + timedelta(days=1)
    agreement = wedding_agreement_service.create_wedding_agreement(
        db, customer.id,
        [{"vehicle_id": vehicle.id, "daily_rate": Decimal("100"),
          "start": start, "end": start + timedelta(days=1)}],
        event_date=start,
    )
    if offset <= 0:
        agreement.pickup_datetime = requested
        agreement.expected_return_datetime = requested + timedelta(days=1)
        for segment in agreement.vehicle_segments:
            segment.start_datetime = requested
            segment.end_datetime = requested + timedelta(days=1)
        db.commit()
        db.refresh(agreement)
    return agreement


@pytest.mark.parametrize("transition", ["cancel", "return", "close", "inspection"])
@pytest.mark.parametrize("other_status, expected", [
    (None, VehicleStatus.AVAILABLE),
    (AgreementStatus.PENDING_PAYMENT, VehicleStatus.RESERVED),
    (AgreementStatus.ACTIVE, VehicleStatus.RENTED),
    (AgreementStatus.OVERDUE, VehicleStatus.RENTED),
])
def test_wedding_release_preserves_other_owner(db, customer, vehicle, transition, other_status, expected):
    # return/close settle a car that has already gone out, so this agreement
    # needs a pickup in the past; cancel/inspection work from a future booking.
    agreement = wedding(db, customer, vehicle, offset=-2 if transition in ("return", "close") else 1)
    if other_status is not None:
        other = wedding(db, customer, vehicle, offset=5)
        other.status = other_status
        if other_status in (AgreementStatus.ACTIVE, AgreementStatus.OVERDUE):
            vehicle.status = VehicleStatus.RENTED
        db.commit()
    now = datetime.now(timezone.utc)
    if transition == "cancel":
        agreement_service.cancel_agreement(db, agreement.id)
    else:
        agreement.status = AgreementStatus.ACTIVE
        db.commit()
        if transition == "return":
            agreement_service.mark_agreement_returned(db, agreement.id, now)
        elif transition == "close":
            agreement_service.close_agreement(db, agreement.id, now)
        else:
            inspection = Inspection(
                agreement_id=agreement.id, vehicle_id=vehicle.id,
                inspection_type="return", inspection_datetime=now,
                status="draft", mileage=100,
            )
            db.add(inspection)
            db.commit()
            inspection_service.sign_inspection(db, inspection, "Test customer")
    db.refresh(vehicle)
    assert vehicle.status == expected


@pytest.mark.parametrize("owner_status, vehicle_status", [
    (AgreementStatus.PENDING_PAYMENT, VehicleStatus.RESERVED),
    (AgreementStatus.ACTIVE, VehicleStatus.RENTED),
    (AgreementStatus.OVERDUE, VehicleStatus.RENTED),
])
def test_cancel_unapproved_request_does_not_release_vehicle(db, customer, vehicle, owner_status, vehicle_status):
    request = wedding(db, customer, vehicle)
    request.status = AgreementStatus.BOOKING_REQUESTED
    db.commit()
    owner = wedding(db, customer, vehicle, offset=5)
    owner.status = owner_status
    vehicle.status = vehicle_status
    db.commit()
    agreement_service.cancel_agreement(db, request.id)
    db.refresh(vehicle)
    assert vehicle.status == vehicle_status


def test_reconciliation_defaults_to_no_writes(db, customer, vehicle, capsys):
    from scripts.reconcile_vehicle_status import reconcile

    agreement = wedding(db, customer, vehicle)
    agreement.status = AgreementStatus.OVERDUE
    vehicle.status = VehicleStatus.AVAILABLE
    db.commit()
    assert reconcile(db) == 1
    output = capsys.readouterr().out
    assert 'available -> rented' in output
    assert 'DRY RUN: 1 vehicle(s) would change; no writes made' in output
    assert not db.dirty
    db.expire_all()
    assert vehicle.status == VehicleStatus.AVAILABLE
    print(output, end='')
    assert reconcile(db, dry_run=False) == 1
    db.expire_all()
    assert vehicle.status == VehicleStatus.RENTED
    assert reconcile(db) == 0


@pytest.mark.parametrize('status', [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE])
def test_release_preserves_operational_hold(db, customer, vehicle, status):
    agreement = wedding(db, customer, vehicle)
    vehicle.status = status
    db.commit()
    agreement_service.cancel_agreement(db, agreement.id)
    db.refresh(vehicle)
    assert vehicle.status == status


def test_settling_returned_agreement_keeps_next_rental_rented(db, customer, vehicle):
    """Financial closure can happen after the car has already gone out again."""
    old = wedding(db, customer, vehicle, offset=-4)
    old.status = AgreementStatus.ACTIVE
    db.commit()
    returned_at = datetime.now(timezone.utc) - timedelta(days=2)
    agreement_service.mark_agreement_returned(db, old.id, returned_at)
    current = wedding(db, customer, vehicle, offset=-1)
    current.status = AgreementStatus.OVERDUE
    db.commit()
    agreement_service.close_agreement(db, old.id, returned_at)
    db.refresh(vehicle)
    assert vehicle.status == VehicleStatus.RENTED


@pytest.mark.parametrize('received', [Decimal('0'), Decimal('50'), Decimal('100')])
def test_wedding_activation_enforces_deposit_and_marks_vehicle_rented(db, customer, vehicle, received):
    from src.core.errors import BusinessError
    from src.models.ledger_entry import PaymentMethod
    from src.services import ledger_service

    agreement = wedding(db, customer, vehicle)
    agreement.deposit_amount = Decimal('100')
    db.commit()
    if received:
        ledger_service.post_deposit(
            db, agreement.id, amount=received, payment_method=PaymentMethod.CASH,
        )
    if received < agreement.deposit_amount:
        with pytest.raises(BusinessError, match='Required deposit not fully received'):
            agreement_service.activate_agreement(db, agreement.id)
        db.refresh(agreement)
        db.refresh(vehicle)
        assert agreement.status == AgreementStatus.PENDING_PAYMENT
        assert vehicle.status == VehicleStatus.RESERVED
    else:
        agreement_service.activate_agreement(db, agreement.id)
        db.refresh(vehicle)
        assert agreement.status == AgreementStatus.ACTIVE
        assert vehicle.status == VehicleStatus.RENTED
        # Deposits are held separately from rental payments.
        assert ledger_service.get_total_payments(db, agreement.id) == Decimal('0')


@pytest.mark.parametrize('status', [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE])
def test_wedding_create_rejects_vehicle_on_operational_hold(db, customer, vehicle, status):
    """A car in the workshop cannot be booked at all, so it never loses its hold."""
    vehicle.status = status
    db.commit()
    with pytest.raises(ValueError, match='not available'):
        wedding(db, customer, vehicle)
    db.refresh(vehicle)
    assert vehicle.status == status


@pytest.mark.parametrize('status', [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE])
def test_wedding_add_vehicle_rejects_operational_hold(db, customer, vehicle, second_vehicle, status):
    agreement = wedding(db, customer, second_vehicle)
    vehicle.status = status
    db.commit()
    start = datetime.now(timezone.utc) + timedelta(days=3)
    with pytest.raises(ValueError, match='not available'):
        wedding_agreement_service.add_vehicle_to_wedding(
            db, agreement.id, vehicle.id, Decimal('100'), start, start + timedelta(days=1),
        )
    db.refresh(vehicle)
    assert vehicle.status == status


def test_wedding_create_sets_reserved_for_future_start(db, customer, vehicle):
    """The recomputed status must still reserve a car for a future booking."""
    wedding(db, customer, vehicle, offset=3)
    db.refresh(vehicle)
    assert vehicle.status == VehicleStatus.RESERVED
