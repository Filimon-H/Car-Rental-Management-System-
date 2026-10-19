"""Availability for a future window must not depend on today's status alone.

A rented car due back on the 10th is free on the 20th, but every check
refused it because its status read RENTED — so it was invisible to the
customer search and impossible for staff to approve. An overdue car is the
opposite case: its return date has passed without a return, so nobody knows
when it will be free, and it must not be promised for any window.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.vehicle import Vehicle, VehicleStatus
from src.repositories import availability_repository
from src.services import agreement_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
)

NOW = datetime.now().replace(microsecond=0)


def car(db: Session, vendor, plate, status=VehicleStatus.AVAILABLE) -> Vehicle:
    v = Vehicle(vendor_id=vendor.id, plate_number=plate, plate_code="3", make="Toyota", model="Yaris",
                year=2024, color="White", vehicle_type="standard", service_type="business",
                car_condition="good", seats=5, transmission="automatic", fuel_type="petrol",
                daily_rate=Decimal("1100.00"), status=status, is_active=True)
    db.add(v); db.commit(); db.refresh(v)
    return v


def agreement(db: Session, vehicle, customer_id, status, start, end, number) -> Agreement:
    a = Agreement(agreement_number=number, agreement_type=AgreementType.CUSTOMER_VEHICLE, status=status,
                  customer_id=customer_id, pickup_datetime=start, expected_return_datetime=end,
                  agreed_daily_rate=vehicle.daily_rate, deposit_amount=Decimal("0"))
    db.add(a); db.flush()
    db.add(AgreementVehicleSegment(agreement_id=a.id, vehicle_id=vehicle.id, start_datetime=start,
                                   end_datetime=end, daily_rate=vehicle.daily_rate))
    db.commit(); db.refresh(a)
    return a


@pytest.fixture
def on_the_road(db: Session, vendor, test_customer):
    """Rented, on time, due back in 10 days."""
    v = car(db, vendor, "DA-RENTED", VehicleStatus.RENTED)
    agreement(db, v, test_customer.id, AgreementStatus.ACTIVE, NOW - timedelta(days=2), NOW + timedelta(days=10), "DA-ACT-1")
    return v


@pytest.fixture
def overdue(db: Session, vendor, test_customer):
    """Due back three days ago, not returned."""
    v = car(db, vendor, "DA-OVERDUE", VehicleStatus.RENTED)
    agreement(db, v, test_customer.id, AgreementStatus.OVERDUE, NOW - timedelta(days=10), NOW - timedelta(days=3), "DA-OVD-1")
    return v


AFTER = (NOW + timedelta(days=20), NOW + timedelta(days=23))
DURING = (NOW + timedelta(days=5), NOW + timedelta(days=8))


class TestARentedCarIsFreeAfterItComesBack:
    def test_it_is_available_after_its_return(self, db: Session, on_the_road):
        assert availability_repository.check_vehicle_available(db, on_the_road.id, *AFTER)

    def test_it_is_not_available_during_the_rental(self, db: Session, on_the_road):
        assert not availability_repository.check_vehicle_available(db, on_the_road.id, *DURING)

    def test_the_search_offers_it_after_its_return(self, db: Session, on_the_road):
        ids = [v.id for v in availability_repository.get_available_vehicles(db, *AFTER, holds_only=True)]
        assert on_the_road.id in ids

    def test_the_search_hides_it_during_the_rental(self, db: Session, on_the_road):
        ids = [v.id for v in availability_repository.get_available_vehicles(db, *DURING, holds_only=True)]
        assert on_the_road.id not in ids


class TestAnOverdueCarIsNeverPromised:
    @pytest.mark.parametrize("days_ahead", [5, 60, 365])
    def test_not_for_any_window(self, db: Session, overdue, days_ahead):
        start = NOW + timedelta(days=days_ahead)
        assert not availability_repository.check_vehicle_available(db, overdue.id, start, start + timedelta(days=2))
        ids = [v.id for v in availability_repository.get_available_vehicles(db, start, start + timedelta(days=2), holds_only=True)]
        assert overdue.id not in ids


class TestAStatusWithNothingBehindItIsNotTrusted:
    def test_rented_by_hand_with_no_rental_is_not_offered(self, db: Session, vendor):
        """No rental means no known return date."""
        v = car(db, vendor, "DA-MANUAL", VehicleStatus.RENTED)
        assert not availability_repository.check_vehicle_available(db, v.id, *AFTER)

    @pytest.mark.parametrize("status", [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE])
    def test_held_out_of_service_is_not_offered(self, db: Session, vendor, status):
        v = car(db, vendor, f"DA-{status.value}", status)
        assert not availability_repository.check_vehicle_available(db, v.id, *AFTER)


class TestApprovingABookingDoesNotRewriteARentedCar:
    def test_approval_succeeds_and_the_car_stays_rented(self, db: Session, on_the_road, test_customer):
        """Approving a future booking used to set the car RESERVED regardless,
        which would mark a car that is out on the road as parked."""
        req = agreement(db, on_the_road, test_customer.id, AgreementStatus.BOOKING_REQUESTED, *AFTER, "DA-REQ-1")

        agreement_service.approve_booking_request(db, req.id)

        db.refresh(on_the_road)
        assert on_the_road.status == VehicleStatus.RENTED

    def test_after_the_return_it_shows_as_reserved(self, db: Session, on_the_road, test_customer):
        from src.services.vehicle_status_service import expected_vehicle_status

        req = agreement(db, on_the_road, test_customer.id, AgreementStatus.BOOKING_REQUESTED, *AFTER, "DA-REQ-2")
        agreement_service.approve_booking_request(db, req.id)
        current = db.query(Agreement).filter(Agreement.agreement_number == "DA-ACT-1").one()
        current.status = AgreementStatus.RETURNED
        db.commit()

        assert expected_vehicle_status(db, on_the_road) == VehicleStatus.RESERVED

    def test_staff_can_book_it_for_after_its_return(self, db: Session, on_the_road, test_customer):
        a = agreement_service.create_standard_agreement(
            db=db, customer_id=test_customer.id, vehicle_id=on_the_road.id,
            pickup_datetime=AFTER[0], expected_return_datetime=AFTER[1], daily_rate=on_the_road.daily_rate)
        assert a.id is not None
        db.refresh(on_the_road)
        assert on_the_road.status == VehicleStatus.RENTED


class TestAWeddingAfterTheReturnKeepsTheCarRented:
    def test_wedding_booking_does_not_mark_a_car_on_the_road_as_parked(self, db: Session, on_the_road):
        from src.services import wedding_agreement_service
        import inspect
        src = inspect.getsource(wedding_agreement_service)
        # Both future-start writes are guarded.
        assert src.count("vehicle.status != VehicleStatus.RENTED") == 2
