"""API-level coverage for vehicle create/update field mapping.

The create handler built its model kwargs from a hand-written dict, so a field
added to VehicleCreate was accepted by the schema, returned 201, and then
silently dropped on the way to the database. weekly_rate and monthly_rate were
lost exactly that way while the update path — which iterates model_dump() —
saved them correctly.
"""
from decimal import Decimal

from sqlalchemy.orm import Session

from src.models.vehicle import Vehicle
from src.models.vendor import Vendor

import pytest
from fastapi.testclient import TestClient

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.staff_user import StaffUser


@pytest.fixture
def fleet_user(db: Session) -> StaffUser:
    """Vehicle writes need MANAGE_VEHICLES, which sales does not carry."""
    user = StaffUser(
        username="fleetuser",
        email="fleet@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Fleet User",
        role=Role.FLEET,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client: TestClient, fleet_user: StaffUser) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"username": "fleetuser", "password": "testpass123"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def payload(vendor_id: int, **overrides) -> dict:
    body = {
        "vendor_id": vendor_id,
        "plate_number": "QA-1002",
        "plate_code": "3",
        "plate_city": "AA",
        "make": "Toyota",
        "model": "Corolla",
        "year": 2021,
        "color": "Black",
        "vehicle_type": "standard",
        "service_type": "business",
        "car_condition": "good",
        "seats": 5,
        "transmission": "manual",
        "fuel_type": "petrol",
        "daily_rate": "1200.00",
    }
    body.update(overrides)
    return body


class TestCreatePersistsPricingTiers:
    def test_weekly_and_monthly_rates_are_stored(self, client, db: Session, vendor: Vendor, auth_headers):
        response = client.post(
            "/api/vehicles",
            headers=auth_headers,
            json=payload(vendor.id, weekly_rate="7000.00", monthly_rate="25000.00"),
        )
        assert response.status_code == 201, response.text

        # Assert against the database, not the response: the response is built
        # from the ORM object, so a value dropped before the insert is the only
        # thing this can catch.
        stored = db.query(Vehicle).filter(Vehicle.plate_number == "QA-1002").one()
        assert stored.weekly_rate == Decimal("7000.00")
        assert stored.monthly_rate == Decimal("25000.00")

    def test_response_reports_the_stored_tiers(self, client, db: Session, vendor: Vendor, auth_headers):
        response = client.post(
            "/api/vehicles",
            headers=auth_headers,
            json=payload(vendor.id, weekly_rate="7000.00", monthly_rate="25000.00"),
        )
        body = response.json()
        assert Decimal(str(body["weekly_rate"])) == Decimal("7000.00")
        assert Decimal(str(body["monthly_rate"])) == Decimal("25000.00")

    def test_tiers_are_optional(self, client, db: Session, vendor: Vendor, auth_headers):
        response = client.post("/api/vehicles", headers=auth_headers, json=payload(vendor.id))
        assert response.status_code == 201, response.text

        stored = db.query(Vehicle).filter(Vehicle.plate_number == "QA-1002").one()
        assert stored.weekly_rate is None
        assert stored.monthly_rate is None

    def test_a_zero_tier_is_kept_not_treated_as_absent(
        self, client, db: Session, vendor: Vendor, auth_headers
    ):
        # The old dict comprehension filtered on `v is not None`, but a zero
        # rate is a real value; this guards the replacement against reviving
        # that class of bug with a falsiness check.
        response = client.post(
            "/api/vehicles", headers=auth_headers, json=payload(vendor.id, weekly_rate="0")
        )
        assert response.status_code == 201, response.text

        stored = db.query(Vehicle).filter(Vehicle.plate_number == "QA-1002").one()
        assert stored.weekly_rate == Decimal("0")


class TestCreateValidation:
    def test_negative_daily_rate_is_rejected(self, client, vendor: Vendor, auth_headers):
        response = client.post(
            "/api/vehicles", headers=auth_headers, json=payload(vendor.id, daily_rate="-100")
        )
        assert response.status_code == 422

    def test_negative_weekly_rate_is_rejected(self, client, vendor: Vendor, auth_headers):
        response = client.post(
            "/api/vehicles", headers=auth_headers, json=payload(vendor.id, weekly_rate="-5")
        )
        assert response.status_code == 422

    def test_out_of_range_year_is_rejected(self, client, vendor: Vendor, auth_headers):
        response = client.post(
            "/api/vehicles", headers=auth_headers, json=payload(vendor.id, year=1200)
        )
        assert response.status_code == 422

    def test_zero_seats_is_rejected(self, client, vendor: Vendor, auth_headers):
        response = client.post(
            "/api/vehicles", headers=auth_headers, json=payload(vendor.id, seats=0)
        )
        assert response.status_code == 422


class TestUpdateKeepsWorking:
    def test_update_still_saves_tiers(self, client, db: Session, vendor: Vendor, auth_headers):
        created = client.post("/api/vehicles", headers=auth_headers, json=payload(vendor.id))
        vehicle_id = created.json()["id"]

        response = client.put(
            f"/api/vehicles/{vehicle_id}",
            headers=auth_headers,
            json={"weekly_rate": "9000.00", "monthly_rate": "32000.00"},
        )
        assert response.status_code == 200, response.text

        db.expire_all()
        stored = db.query(Vehicle).filter(Vehicle.id == vehicle_id).one()
        assert stored.weekly_rate == Decimal("9000.00")
        assert stored.monthly_rate == Decimal("32000.00")

    def test_insurance_policy_number_still_maps_to_its_model_field(
        self, client, db: Session, vendor: Vendor, auth_headers
    ):
        # This field is renamed between API and model; the create rewrite must
        # not lose that mapping.
        response = client.post(
            "/api/vehicles",
            headers=auth_headers,
            json=payload(vendor.id, insurance_policy_number="POL-123"),
        )
        assert response.status_code == 201, response.text

        stored = db.query(Vehicle).filter(Vehicle.plate_number == "QA-1002").one()
        assert stored.insurance_policy == "POL-123"


class TestPhotoUploadValidation:
    """Photos are judged by their bytes, not by the filename or Content-Type."""

    JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
    TEXT = b"this is a text file pretending to be a jpg\n"

    def _vehicle_id(self, client, vendor, auth_headers) -> int:
        created = client.post("/api/vehicles", headers=auth_headers, json=payload(vendor.id))
        return created.json()["id"]

    def test_text_disguised_as_jpg_is_rejected(self, client, vendor: Vendor, auth_headers):
        vehicle_id = self._vehicle_id(client, vendor, auth_headers)
        response = client.post(
            f"/api/vehicles/{vehicle_id}/photos",
            headers=auth_headers,
            files={"front": ("x.jpg", self.TEXT, "image/jpeg")},
        )
        assert response.status_code == 400, response.text
        assert "not a valid image" in response.json()["detail"]

    def test_a_real_jpeg_is_accepted(self, client, vendor: Vendor, auth_headers):
        vehicle_id = self._vehicle_id(client, vendor, auth_headers)
        response = client.post(
            f"/api/vehicles/{vehicle_id}/photos",
            headers=auth_headers,
            files={"front": ("front.jpg", self.JPEG, "image/jpeg")},
        )
        assert response.status_code == 200, response.text
        assert response.json()["photo_front"]

    def test_one_bad_file_stores_none_of_them(
        self, client, db: Session, vendor: Vendor, auth_headers
    ):
        # All sides share one request. A valid front photo must not be written
        # when the left photo is rejected, or the caller cannot tell what
        # landed and what did not.
        vehicle_id = self._vehicle_id(client, vendor, auth_headers)
        response = client.post(
            f"/api/vehicles/{vehicle_id}/photos",
            headers=auth_headers,
            files={
                "front": ("front.jpg", self.JPEG, "image/jpeg"),
                "left": ("left.jpg", self.TEXT, "image/jpeg"),
            },
        )
        assert response.status_code == 400, response.text

        db.expire_all()
        stored = db.query(Vehicle).filter(Vehicle.id == vehicle_id).one()
        assert stored.photo_front is None
        assert stored.photo_left is None
