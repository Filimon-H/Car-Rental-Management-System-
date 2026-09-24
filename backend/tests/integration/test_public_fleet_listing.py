"""The public fleet must not advertise cars it cannot rent.

A retired vehicle appeared on the browse page, and vehicles showed an
"Available from" date that had already passed.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import AgreementStatus
from src.models.vehicle import Vehicle, VehicleStatus
from src.models.vendor import Vendor
from src.services import agreement_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
)


def make_vehicle(db: Session, vendor: Vendor, plate: str, status=VehicleStatus.AVAILABLE) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate,
        plate_code="3",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="White",
        vehicle_type="standard",
        service_type="business",
        car_condition="good",
        seats=5,
        transmission="manual",
        fuel_type="petrol",
        daily_rate=Decimal("1500.00"),
        status=status,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def listed(client) -> list[dict]:
    response = client.get("/api/public/vehicles")
    assert response.status_code == 200, response.text
    return response.json()


class TestRetiredVehiclesAreNotAdvertised:
    @pytest.mark.parametrize(
        "status", [VehicleStatus.INACTIVE, VehicleStatus.MAINTENANCE]
    )
    def test_an_operational_hold_is_excluded(self, client, db: Session, vendor, status):
        """Retired is stored as status INACTIVE while is_active stays True.

        Filtering on is_active alone therefore let it through, which is how a
        retired car was offered to customers.
        """
        held = make_vehicle(db, vendor, f"PUB-{status.value}", status=status)
        assert held.is_active is True

        assert held.id not in [v["id"] for v in listed(client)]

    def test_fetching_one_directly_is_404(self, client, db: Session, vendor):
        held = make_vehicle(db, vendor, "PUB-RETIRED", status=VehicleStatus.INACTIVE)

        assert client.get(f"/api/public/vehicles/{held.id}").status_code == 404

    def test_a_bookable_vehicle_is_still_listed(self, client, db: Session, vendor):
        free = make_vehicle(db, vendor, "PUB-FREE")
        assert free.id in [v["id"] for v in listed(client)]


class TestAvailableFromIsNeverInThePast:
    def test_a_stale_booking_does_not_produce_a_past_date(
        self, client, db: Session, vendor, test_customer
    ):
        """A booking whose return date passed without being closed.

        The query took the earliest segment outright, so the browse page
        advertised "Available from" a date months gone.
        """
        vehicle = make_vehicle(db, vendor, "PUB-STALE")
        pickup = datetime.now(timezone.utc) + timedelta(days=2)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=Decimal("1500.00"),
        )
        # Drag it into the past, leaving the agreement open.
        now = datetime.now()
        agreement.pickup_datetime = now - timedelta(days=90)
        agreement.expected_return_datetime = now - timedelta(days=80)
        agreement.status = AgreementStatus.ACTIVE
        for segment in agreement.vehicle_segments:
            segment.start_datetime = now - timedelta(days=90)
            segment.end_datetime = now - timedelta(days=80)
        db.commit()

        row = next(v for v in listed(client) if v["id"] == vehicle.id)
        if row["available_from"] is not None:
            returned = datetime.fromisoformat(row["available_from"].replace("Z", ""))
            assert returned > now, f"advertised a past date: {returned}"

    def test_a_future_booking_still_reports_its_return(
        self, client, db: Session, vendor, test_customer
    ):
        vehicle = make_vehicle(db, vendor, "PUB-FUTURE")
        pickup = datetime.now(timezone.utc) + timedelta(days=5)
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=vehicle.vendor_id and test_customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=4),
            daily_rate=Decimal("1500.00"),
        )

        row = next(v for v in listed(client) if v["id"] == vehicle.id)
        assert row["available_from"] is not None
        returned = datetime.fromisoformat(row["available_from"].replace("Z", ""))
        assert returned > datetime.now()

    def test_no_listed_vehicle_advertises_a_past_date(
        self, client, db: Session, vendor, test_customer
    ):
        """Whole-listing guard, which is how QA spotted this."""
        now = datetime.now()
        for row in listed(client):
            if row["available_from"] is None:
                continue
            returned = datetime.fromisoformat(row["available_from"].replace("Z", ""))
            assert returned > now, f"vehicle {row['id']} advertises {returned}"
