"""The browse page says whether a car is free today, not whether it is booked ever.

A car with one confirmed booking two months out is RESERVED, and the website
showed it as Unavailable today, with "Available from" the end of that far
booking, though it was free right now. Customers saw nothing to book. Booking
stays safe either way: a request that overlaps a confirmed booking is refused.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from src.models.agreement import AgreementStatus
from src.models.vehicle import VehicleStatus
from tests.integration.test_agreements_standard import test_customer  # noqa: F401
from tests.integration.test_public_availability_search import hold, make_vehicle, search


def _now() -> datetime:
    # Agreement times are business wall clock (Addis Ababa), stored naive.
    from src.api.routers.public import _as_business_wall_clock
    from datetime import timezone

    return _as_business_wall_clock(datetime.now(timezone.utc)).replace(second=0, microsecond=0)


def _card(client, vehicle_id):
    return next(v for v in search(client) if v["id"] == vehicle_id)


def test_a_car_booked_months_away_is_free_today(client, db: Session, vendor, test_customer):
    car = make_vehicle(db, vendor, "BROWSE-FAR")
    hold(db, car, test_customer.id, _now() + timedelta(days=60), _now() + timedelta(days=65))
    car.status = VehicleStatus.RESERVED
    db.commit()

    card = _card(client, car.id)
    assert card["status"] == "available"
    assert card["available_from"] is None


def test_a_car_booked_from_later_today_is_reserved(client, db: Session, vendor, test_customer):
    car = make_vehicle(db, vendor, "BROWSE-SOON")
    end = _now() + timedelta(days=3)
    hold(db, car, test_customer.id, _now() + timedelta(hours=3), end)
    car.status = VehicleStatus.RESERVED
    db.commit()

    card = _card(client, car.id)
    assert card["status"] == "reserved"
    assert card["available_from"].startswith(end.isoformat()[:16])


def test_available_from_is_the_end_of_the_booking_in_the_way(client, db: Session, vendor, test_customer):
    """Not the end of a later one."""
    car = make_vehicle(db, vendor, "BROWSE-TWO")
    near_end = _now() + timedelta(days=2)
    first = hold(db, car, test_customer.id, _now() - timedelta(hours=1), near_end)
    first.status = AgreementStatus.ACTIVE
    first.agreement_number = "HOLD-NEAR"
    db.commit()
    hold(db, car, test_customer.id, _now() + timedelta(days=30), _now() + timedelta(days=35))
    car.status = VehicleStatus.RENTED
    db.commit()

    card = _card(client, car.id)
    assert card["status"] == "rented"
    assert card["available_from"].startswith(near_end.isoformat()[:16])
