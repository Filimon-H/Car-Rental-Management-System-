"""A rental must not be booked on an expired driving licence.

The booking flow accepted a customer whose licence and ID had both expired
months earlier, with no warning to the customer and no flag for staff. For a
car rental an expired licence is not a paperwork detail: the customer cannot
legally drive, and the rental company carries the consequences.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor

from tests.integration.test_extend_booking import (  # noqa: F401
    customer,
    customer_headers,
    customer_user,
)


@pytest.fixture
def bookable(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="DOC-0001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1100.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def book(client, headers, vehicle, pickup, ret):
    return client.post(
        "/api/public/bookings",
        json={
            "vehicle_id": vehicle.id,
            "pickup_datetime": pickup.isoformat(),
            "expected_return_datetime": ret.isoformat(),
        },
        headers=headers,
    )


class TestExpiredLicenceIsRefused:
    def test_a_licence_expired_before_the_rental_blocks_the_booking(
        self, client, db: Session, customer, customer_headers, bookable
    ):
        customer.license_expiry = datetime.now() - timedelta(days=120)
        db.commit()

        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        r = book(client, customer_headers, bookable, pickup, pickup + timedelta(days=3))

        assert r.status_code == 400, f"expired licence accepted: {r.text}"
        assert "licence" in r.text.lower() or "license" in r.text.lower()

    def test_a_licence_expiring_mid_rental_blocks_the_booking(
        self, client, db: Session, customer, customer_headers, bookable
    ):
        """Valid at pickup is not enough — it must cover the return."""
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        customer.license_expiry = pickup + timedelta(days=1)
        db.commit()

        r = book(client, customer_headers, bookable, pickup, pickup + timedelta(days=5))

        assert r.status_code == 400, f"licence expiring mid-rental accepted: {r.text}"

    def test_a_valid_licence_books_normally(
        self, client, db: Session, customer, customer_headers, bookable
    ):
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        customer.license_expiry = pickup + timedelta(days=400)
        customer.id_expiry = pickup + timedelta(days=400)
        db.commit()

        r = book(client, customer_headers, bookable, pickup, pickup + timedelta(days=3))
        assert r.status_code in (200, 201), r.text

    def test_no_recorded_expiry_is_not_treated_as_expired(
        self, client, db: Session, customer, customer_headers, bookable
    ):
        """Absent data must not block a booking; staff verify at pickup."""
        customer.license_expiry = None
        customer.id_expiry = None
        db.commit()

        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        r = book(client, customer_headers, bookable, pickup, pickup + timedelta(days=3))
        assert r.status_code in (200, 201), r.text
