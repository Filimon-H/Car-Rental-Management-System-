"""Adding a vehicle to a wedding agreement, including the rejection paths.

Every guard in wedding_agreement_service raised a bare ValueError. FastAPI
has no handler for that inside an endpoint, so the connection closed with no
response at all — the browser reported status 0 rather than a 4xx, and the
rules could not be verified from the UI.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement
from src.models.vehicle import Vehicle, VehicleStatus
from src.models.vendor import Vendor
from src.services import wedding_agreement_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
)

START = datetime.now(timezone.utc) + timedelta(days=30)


def make_vehicle(db, vendor, plate, status=VehicleStatus.AVAILABLE) -> Vehicle:
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
def wedding(db: Session, vendor: Vendor, test_customer):
    first = make_vehicle(db, vendor, "QA-WED-1")
    return wedding_agreement_service.create_wedding_agreement(
        db,
        test_customer.id,
        [
            {
                "vehicle_id": first.id,
                "daily_rate": Decimal("1200.00"),
                "start": START,
                "end": START + timedelta(days=1),
            }
        ],
        event_date=START,
    )


def add(client, auth_headers, agreement_id, vehicle_id, start, end, rate="1500.00"):
    return client.post(
        f"/api/agreements/{agreement_id}/vehicles",
        headers=auth_headers,
        json={
            "vehicle_id": vehicle_id,
            "daily_rate": rate,
            "start_datetime": start.isoformat(),
            "end_datetime": end.isoformat(),
        },
    )


class TestRejectionsReturnAResponse:
    def test_a_rented_vehicle_is_refused_with_400(
        self, client, db: Session, vendor, wedding, auth_headers
    ):
        rented = make_vehicle(db, vendor, "QA-WED-RENTED", status=VehicleStatus.RENTED)
        r = add(client, auth_headers, wedding.id, rented.id, START, START + timedelta(days=1))

        assert r.status_code == 400, r.text
        assert "not available" in r.json()["detail"]
        assert r.json()["error_code"] == "BIZ_001"

    @pytest.mark.parametrize(
        "status", [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE]
    )
    def test_an_operational_hold_is_refused_with_400(
        self, client, db: Session, vendor, wedding, auth_headers, status
    ):
        held = make_vehicle(db, vendor, f"QA-WED-{status.value}", status=status)
        r = add(client, auth_headers, wedding.id, held.id, START, START + timedelta(days=1))

        assert r.status_code == 400, r.text
        assert "not available" in r.json()["detail"]

    def test_inverted_dates_are_refused_with_400(
        self, client, db: Session, vendor, wedding, auth_headers
    ):
        free = make_vehicle(db, vendor, "QA-WED-INV")
        r = add(client, auth_headers, wedding.id, free.id, START + timedelta(days=2), START)

        assert r.status_code == 400, r.text
        assert "after start" in r.json()["detail"].lower()

    def test_a_missing_agreement_is_404_not_a_dropped_connection(
        self, client, db: Session, vendor, auth_headers
    ):
        free = make_vehicle(db, vendor, "QA-WED-404")
        r = add(client, auth_headers, 999999, free.id, START, START + timedelta(days=1))

        assert r.status_code == 404, r.text

    def test_a_refused_add_leaves_the_agreement_untouched(
        self, client, db: Session, vendor, wedding, auth_headers
    ):
        before = len(wedding.vehicle_segments)
        rented = make_vehicle(db, vendor, "QA-WED-NOOP", status=VehicleStatus.RENTED)

        add(client, auth_headers, wedding.id, rented.id, START, START + timedelta(days=1))

        db.expire_all()
        after = db.query(Agreement).filter(Agreement.id == wedding.id).one()
        assert len(after.vehicle_segments) == before


class TestReturnDateNeverShrinks:
    def test_an_earlier_end_date_does_not_pull_the_return_in(
        self, client, db: Session, vendor, wedding, auth_headers
    ):
        """The section 3 rule QA was blocked from testing by the crash."""
        original_return = wedding.expected_return_datetime

        short = make_vehicle(db, vendor, "QA-WED-SHORT")
        r = add(
            client,
            auth_headers,
            wedding.id,
            short.id,
            START,
            START + timedelta(hours=3),
            rate="900.00",
        )
        assert r.status_code == 201, r.text

        db.expire_all()
        after = db.query(Agreement).filter(Agreement.id == wedding.id).one()
        assert after.expected_return_datetime == original_return

    def test_a_later_end_date_does_extend_the_return(
        self, client, db: Session, vendor, wedding, auth_headers
    ):
        longer = make_vehicle(db, vendor, "QA-WED-LONG")
        new_end = START + timedelta(days=4)

        r = add(client, auth_headers, wedding.id, longer.id, START, new_end)
        assert r.status_code == 201, r.text

        db.expire_all()
        after = db.query(Agreement).filter(Agreement.id == wedding.id).one()
        assert after.expected_return_datetime.replace(tzinfo=timezone.utc) == new_end
