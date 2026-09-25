"""Browsing by date, so the website can offer only bookable cars.

The bot asks when before what and filters the fleet to cars actually free
for those dates. The website could not: /api/public/vehicles took no dates,
so a customer picked a car and was refused at submit. Same system, two
behaviours.

Dates are optional, so the existing unfiltered browse keeps working.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.vehicle import Vehicle, VehicleStatus
from src.models.vendor import Vendor

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
)


def make_vehicle(db: Session, vendor: Vendor, plate: str) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate,
        plate_code="3",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type="standard",
        service_type="business",
        car_condition="good",
        seats=5,
        transmission="automatic",
        fuel_type="petrol",
        daily_rate=Decimal("1100.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def hold(db: Session, vehicle: Vehicle, customer_id: int, start, end) -> Agreement:
    """An agreement that genuinely occupies the vehicle."""
    a = Agreement(
        agreement_number=f"HOLD-{vehicle.id}",
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=AgreementStatus.PENDING_PAYMENT,
        customer_id=customer_id,
        pickup_datetime=start,
        expected_return_datetime=end,
        agreed_daily_rate=vehicle.daily_rate,
        deposit_amount=Decimal("0"),
    )
    db.add(a)
    db.flush()
    db.add(
        AgreementVehicleSegment(
            agreement_id=a.id,
            vehicle_id=vehicle.id,
            start_datetime=start,
            end_datetime=end,
            daily_rate=vehicle.daily_rate,
        )
    )
    db.commit()
    return a


def search(client, start=None, end=None):
    params = {}
    if start:
        params["pickup_datetime"] = start.isoformat()
    if end:
        params["expected_return_datetime"] = end.isoformat()
    r = client.get("/api/public/vehicles", params=params)
    assert r.status_code == 200, r.text
    return r.json()


class TestFilteringByDates:
    def test_a_car_held_for_those_dates_is_excluded(
        self, client, db: Session, vendor, test_customer
    ):
        free = make_vehicle(db, vendor, "AVAIL-FREE")
        busy = make_vehicle(db, vendor, "AVAIL-BUSY")

        start = datetime.now().replace(microsecond=0) + timedelta(days=20)
        end = start + timedelta(days=3)
        hold(db, busy, test_customer.id, start - timedelta(days=1), end + timedelta(days=1))

        ids = [v["id"] for v in search(client, start, end)]
        assert free.id in ids
        assert busy.id not in ids, "offered a car already held for those dates"

    def test_the_same_car_is_free_on_other_dates(
        self, client, db: Session, vendor, test_customer
    ):
        busy = make_vehicle(db, vendor, "AVAIL-LATER")
        start = datetime.now().replace(microsecond=0) + timedelta(days=20)
        hold(db, busy, test_customer.id, start, start + timedelta(days=3))

        later = start + timedelta(days=30)
        ids = [v["id"] for v in search(client, later, later + timedelta(days=3))]
        assert busy.id in ids, "excluded a car that is free for the dates asked for"

    def test_without_dates_everything_bookable_is_listed(
        self, client, db: Session, vendor, test_customer
    ):
        """The plain browse must keep working."""
        busy = make_vehicle(db, vendor, "AVAIL-BROWSE")
        start = datetime.now().replace(microsecond=0) + timedelta(days=20)
        hold(db, busy, test_customer.id, start, start + timedelta(days=3))

        ids = [v["id"] for v in search(client)]
        assert busy.id in ids


class TestBadInputIsRefusedClearly:
    def test_a_return_before_pickup_is_rejected(self, client, db: Session, vendor):
        make_vehicle(db, vendor, "AVAIL-ORDER")
        start = datetime.now().replace(microsecond=0) + timedelta(days=20)

        r = client.get(
            "/api/public/vehicles",
            params={
                "pickup_datetime": start.isoformat(),
                "expected_return_datetime": (start - timedelta(days=1)).isoformat(),
            },
        )
        assert r.status_code == 400, r.text

    def test_only_one_date_is_rejected(self, client, db: Session, vendor):
        """Half a range is a mistake, not an unfiltered browse."""
        make_vehicle(db, vendor, "AVAIL-HALF")
        start = datetime.now().replace(microsecond=0) + timedelta(days=20)

        r = client.get(
            "/api/public/vehicles",
            params={"pickup_datetime": start.isoformat()},
        )
        assert r.status_code == 400, r.text

    def test_a_past_pickup_is_rejected(self, client, db: Session, vendor):
        make_vehicle(db, vendor, "AVAIL-PAST")
        past = datetime.now().replace(microsecond=0) - timedelta(days=5)

        r = client.get(
            "/api/public/vehicles",
            params={
                "pickup_datetime": past.isoformat(),
                "expected_return_datetime": (past + timedelta(days=2)).isoformat(),
            },
        )
        assert r.status_code == 400, r.text


class TestTheResponseCarriesThePrice:
    def test_a_filtered_result_quotes_the_whole_rental(
        self, client, db: Session, vendor
    ):
        """So the card can show a total, not a rate to multiply."""
        v = make_vehicle(db, vendor, "AVAIL-PRICE")
        v.weekly_rate = Decimal("6500.00")
        db.commit()

        start = datetime.now().replace(microsecond=0) + timedelta(days=20)
        rows = search(client, start, start + timedelta(days=7))
        row = next(r for r in rows if r["id"] == v.id)

        assert row.get("quoted_total") is not None, row
        assert Decimal(row["quoted_total"]) == Decimal("6500.00"), row
        assert row.get("quoted_days") == 7, row
