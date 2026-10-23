"""The available-vehicles list and the single-vehicle check must agree.

The list filtered on status == AVAILABLE while the check accepted RESERVED
too. RESERVED only records that some future booking exists, so a car booked
in September disappeared from the list for dates in October even though
check/{id} reported it available and a direct POST created the agreement.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.vehicle import Vehicle, VehicleStatus
from src.models.vendor import Vendor
from src.repositories import availability_repository
from src.services import agreement_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
)

# Two clearly separate windows, both in the future.
SEPT = datetime.now(timezone.utc) + timedelta(days=10)
OCT = datetime.now(timezone.utc) + timedelta(days=40)


def make_vehicle(db: Session, vendor: Vendor, plate: str, status=VehicleStatus.AVAILABLE) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate,
        plate_code="3",
        make="Toyota",
        model="Corolla",
        year=2021,
        color="White",
        vehicle_type="standard",
        service_type="business",
        car_condition="good",
        seats=5,
        transmission="manual",
        fuel_type="petrol",
        daily_rate=Decimal("1200.00"),
        status=status,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def booked_vehicle(db: Session, vendor: Vendor, test_customer) -> Vehicle:
    """A vehicle with a September booking, therefore left RESERVED."""
    vehicle = make_vehicle(db, vendor, "QA-BOOKED")
    agreement_service.create_standard_agreement(
        db=db,
        customer_id=test_customer.id,
        vehicle_id=vehicle.id,
        pickup_datetime=SEPT,
        expected_return_datetime=SEPT + timedelta(days=3),
        daily_rate=Decimal("1200.00"),
    )
    db.refresh(vehicle)
    assert vehicle.status == VehicleStatus.RESERVED
    return vehicle


def available_ids(db, start, end):
    return {v.id for v in availability_repository.get_available_vehicles(db, start, end)}


class TestReservedVehiclesStayBookableElsewhere:
    def test_listed_for_a_window_it_is_free_in(self, db: Session, booked_vehicle):
        assert booked_vehicle.id in available_ids(db, OCT, OCT + timedelta(days=6))

    def test_not_listed_for_its_own_booked_window(self, db: Session, booked_vehicle):
        assert booked_vehicle.id not in available_ids(
            db, SEPT + timedelta(days=1), SEPT + timedelta(days=2)
        )

    def test_the_list_agrees_with_the_single_check(self, db: Session, booked_vehicle):
        # The two used different status rules; this is what caught the bug.
        for start, end in [
            (OCT, OCT + timedelta(days=6)),
            (SEPT + timedelta(days=1), SEPT + timedelta(days=2)),
        ]:
            in_list = booked_vehicle.id in available_ids(db, start, end)
            checked = availability_repository.check_vehicle_available(
                db, booked_vehicle.id, start, end
            )
            assert in_list == checked, f"list and check disagree for {start}"

    def test_an_untouched_vehicle_is_listed_for_both_windows(
        self, db: Session, vendor: Vendor, booked_vehicle
    ):
        free = make_vehicle(db, vendor, "QA-FREE")
        assert free.id in available_ids(db, OCT, OCT + timedelta(days=6))
        assert free.id in available_ids(db, SEPT, SEPT + timedelta(days=3))


class TestOperationalHoldsAreNeverListed:
    @pytest.mark.parametrize(
        "status", [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE, VehicleStatus.RENTED]
    )
    def test_excluded_whatever_the_window(self, db: Session, vendor: Vendor, status):
        held = make_vehicle(db, vendor, f"QA-{status.value.upper()}", status=status)
        assert held.id not in available_ids(db, OCT, OCT + timedelta(days=6))

    def test_an_inactive_vehicle_is_excluded(self, db: Session, vendor: Vendor):
        v = make_vehicle(db, vendor, "QA-DEACTIVATED")
        v.is_active = False
        db.commit()
        assert v.id not in available_ids(db, OCT, OCT + timedelta(days=6))


class TestEndpointMatchesRepository:
    def test_api_lists_a_reserved_vehicle_for_a_free_window(
        self, client, booked_vehicle, auth_headers
    ):
        response = client.get(
            "/api/availability/vehicles",
            params={
                "start_datetime": OCT.isoformat(),
                "end_datetime": (OCT + timedelta(days=6)).isoformat(),
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert booked_vehicle.id in [v["id"] for v in response.json()]

    def test_api_omits_it_for_its_booked_window(self, client, booked_vehicle, auth_headers):
        response = client.get(
            "/api/availability/vehicles",
            params={
                "start_datetime": (SEPT + timedelta(days=1)).isoformat(),
                "end_datetime": (SEPT + timedelta(days=2)).isoformat(),
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert booked_vehicle.id not in [v["id"] for v in response.json()]
