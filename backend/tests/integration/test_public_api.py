"""Integration tests for /api/public/* endpoints.

Covers:
- POST /api/public/auth/signup
- POST /api/public/auth/login
- POST /api/public/auth/logout
- GET  /api/public/me
- GET  /api/public/vehicles
- GET  /api/public/vehicles/{id}
- POST /api/public/bookings
- GET  /api/public/bookings
- POST /api/public/bookings/{id}/cancel
- Cross-auth isolation: customer token rejected on staff endpoints
- Staff approve-request endpoint: POST /api/agreements/{id}/approve-request
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.staff_user import StaffUser
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

def _future(days: int) -> str:
    dt = datetime.now(timezone.utc) + timedelta(days=days)
    return dt.isoformat()


@pytest.fixture
def vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="CC-20001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Hilux",
        year=2022,
        color="White",
        vehicle_type=VehicleType.PICKUP,
        service_type="field",
        daily_rate=Decimal("2000.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def inactive_vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="CC-20002",
        plate_code="01",
        plate_city="AA",
        make="Ford",
        model="Ranger",
        year=2021,
        color="Black",
        vehicle_type=VehicleType.PICKUP,
        service_type="field",
        daily_rate=Decimal("1800.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=False,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def staff_user(db: Session) -> StaffUser:
    u = StaffUser(
        username="manager1",
        email="manager@nod.et",
        hashed_password=hash_password("staffpass1"),
        full_name="Nod Manager",
        role=Role.ADMIN,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def staff_headers(client: TestClient, staff_user: StaffUser) -> dict:
    resp = client.post(
        "/api/auth/login",
        json={"username": "manager1", "password": "staffpass1"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def signup_payload() -> dict:
    return {
        "email": "customer@example.com",
        "password": "securepass1",
        "first_name": "Selamawit",
        "last_name": "Tadesse",
        "phone": "0912345678",
    }


@pytest.fixture
def registered_customer_headers(client: TestClient, signup_payload: dict) -> dict:
    """Sign up a customer and return auth headers."""
    resp = client.post("/api/public/auth/signup", json=signup_payload)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------

class TestSignup:
    def test_signup_returns_token(self, client: TestClient, signup_payload: dict):
        resp = client.post("/api/public/auth/signup", json=signup_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_signup_creates_customer_record(self, client: TestClient, db: Session, signup_payload: dict):
        client.post("/api/public/auth/signup", json=signup_payload)
        user = db.query(CustomerUser).filter(CustomerUser.email == signup_payload["email"]).first()
        assert user is not None
        customer = db.query(Customer).filter(Customer.id == user.customer_id).first()
        assert customer is not None
        assert customer.first_name == signup_payload["first_name"]
        # Stored canonically, so a staff-created record for the same person matches.
        assert customer.phone_primary == "+251912345678"

    def test_duplicate_email_rejected(self, client: TestClient, signup_payload: dict):
        client.post("/api/public/auth/signup", json=signup_payload)
        resp = client.post("/api/public/auth/signup", json=signup_payload)
        assert resp.status_code == 409

    def test_duplicate_phone_rejected(self, client: TestClient, signup_payload: dict):
        first = client.post("/api/public/auth/signup", json=signup_payload)
        assert first.status_code == 200
        duplicate = {**signup_payload, "email": "different@example.com"}
        duplicate["phone"] = "+251 912-345-678"
        resp = client.post("/api/public/auth/signup", json=duplicate)
        assert resp.status_code == 409
        assert "phone" in resp.json()["detail"].lower()

    def test_short_password_rejected(self, client: TestClient, signup_payload: dict):
        signup_payload["password"] = "short"
        resp = client.post("/api/public/auth/signup", json=signup_payload)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class TestLogin:
    def test_login_success(self, client: TestClient, signup_payload: dict):
        client.post("/api/public/auth/signup", json=signup_payload)
        resp = client.post(
            "/api/public/auth/login",
            json={"email": signup_payload["email"], "password": signup_payload["password"]},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_wrong_password_rejected(self, client: TestClient, signup_payload: dict):
        client.post("/api/public/auth/signup", json=signup_payload)
        resp = client.post(
            "/api/public/auth/login",
            json={"email": signup_payload["email"], "password": "wrongpass"},
        )
        assert resp.status_code == 401

    def test_unknown_email_rejected(self, client: TestClient):
        resp = client.post(
            "/api/public/auth/login",
            json={"email": "nobody@example.com", "password": "anything"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Profile (/me)
# ---------------------------------------------------------------------------

class TestProfile:
    def test_me_returns_profile(
        self, client: TestClient, signup_payload: dict, registered_customer_headers: dict
    ):
        resp = client.get("/api/public/me", headers=registered_customer_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == signup_payload["first_name"]
        assert data["phone_primary"] == "+251912345678"

    def test_me_unauthenticated_rejected(self, client: TestClient):
        resp = client.get("/api/public/me")
        assert resp.status_code == 401

    def test_staff_token_rejected_on_me(
        self, client: TestClient, staff_headers: dict
    ):
        """A staff JWT cannot access the customer /me endpoint."""
        resp = client.get("/api/public/me", headers=staff_headers)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Vehicles (public, no auth required)
# ---------------------------------------------------------------------------

class TestVehicles:
    def test_list_vehicles_no_auth(self, client: TestClient, vehicle: Vehicle):
        resp = client.get("/api/public/vehicles")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert vehicle.id in ids

    def test_inactive_vehicle_excluded(
        self, client: TestClient, vehicle: Vehicle, inactive_vehicle: Vehicle
    ):
        resp = client.get("/api/public/vehicles")
        ids = [v["id"] for v in resp.json()]
        assert inactive_vehicle.id not in ids

    def test_get_single_vehicle(self, client: TestClient, vehicle: Vehicle):
        resp = client.get(f"/api/public/vehicles/{vehicle.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == vehicle.id
        assert resp.json()["make"] == vehicle.make

    def test_get_inactive_vehicle_returns_404(
        self, client: TestClient, inactive_vehicle: Vehicle
    ):
        resp = client.get(f"/api/public/vehicles/{inactive_vehicle.id}")
        assert resp.status_code == 404

    def test_get_nonexistent_vehicle_returns_404(self, client: TestClient):
        resp = client.get("/api/public/vehicles/999999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class TestCreateBooking:
    def test_create_booking_returns_booking_requested(
        self,
        client: TestClient,
        vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "booking_requested"
        assert data["vehicle"]["id"] == vehicle.id

    def test_create_booking_does_not_lock_vehicle(
        self,
        client: TestClient,
        db: Session,
        vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.AVAILABLE

    def test_create_booking_unauthenticated_rejected(
        self, client: TestClient, vehicle: Vehicle
    ):
        resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
        )
        assert resp.status_code == 401

    def test_invalid_date_range_rejected(
        self,
        client: TestClient,
        vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(6),
                "expected_return_datetime": _future(3),  # return before pickup
            },
            headers=registered_customer_headers,
        )
        assert resp.status_code == 422 or resp.status_code == 400

    def test_inactive_vehicle_returns_404(
        self,
        client: TestClient,
        inactive_vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": inactive_vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        assert resp.status_code == 404


class TestListBookings:
    def test_list_bookings_returns_own_only(
        self,
        client: TestClient,
        vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        resp = client.get("/api/public/bookings", headers=registered_customer_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["status"] == "booking_requested"

    def test_list_bookings_unauthenticated_rejected(self, client: TestClient):
        resp = client.get("/api/public/bookings")
        assert resp.status_code == 401


class TestCancelBooking:
    def test_cancel_booking_request(
        self,
        client: TestClient,
        vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        create_resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        booking_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/public/bookings/{booking_id}/cancel",
            headers=registered_customer_headers,
        )
        assert resp.status_code == 200

        bookings = client.get("/api/public/bookings", headers=registered_customer_headers).json()
        assert bookings[0]["status"] == "cancelled"

    def test_cancel_other_customers_booking_rejected(
        self,
        client: TestClient,
        db: Session,
        vehicle: Vehicle,
        vendor: Vendor,
        registered_customer_headers: dict,
    ):
        """A customer cannot cancel another customer's booking."""
        other_customer = Customer(
            first_name="Other", last_name="Person", phone_primary="0999000001",
            email="other@example.com", business_type="individual", is_active=True,
        )
        db.add(other_customer)
        db.flush()
        other_user = CustomerUser(
            customer_id=other_customer.id, email="other@example.com",
            hashed_password=hash_password("password123"), token_version=0, is_active=True,
        )
        db.add(other_user)
        db.commit()

        other_resp = client.post(
            "/api/public/auth/login",
            json={"email": "other@example.com", "password": "password123"},
        )
        other_headers = {"Authorization": f"Bearer {other_resp.json()['access_token']}"}

        create_resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        booking_id = create_resp.json()["id"]

        # Other customer tries to cancel
        resp = client.post(
            f"/api/public/bookings/{booking_id}/cancel",
            headers=other_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Logout — token invalidation
# ---------------------------------------------------------------------------

class TestLogout:
    def test_logout_invalidates_token(self, client: TestClient, signup_payload: dict):
        signup_resp = client.post("/api/public/auth/signup", json=signup_payload)
        token = signup_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        client.post("/api/public/auth/logout", headers=headers)

        # Old token should now be rejected
        resp = client.get("/api/public/me", headers=headers)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Cross-auth isolation
# ---------------------------------------------------------------------------

class TestCrossAuthIsolation:
    def test_customer_token_rejected_on_staff_agreements(
        self, client: TestClient, signup_payload: dict
    ):
        """A customer JWT must be rejected by the staff agreements endpoint."""
        resp = client.post("/api/public/auth/signup", json=signup_payload)
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        staff_resp = client.get("/api/agreements", headers=headers)
        assert staff_resp.status_code == 401

    def test_unauthenticated_staff_endpoint_rejected(self, client: TestClient):
        resp = client.get("/api/agreements")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Staff approve-request endpoint
# ---------------------------------------------------------------------------

class TestApproveRequest:
    def test_staff_can_approve_booking_request(
        self,
        client: TestClient,
        db: Session,
        vehicle: Vehicle,
        registered_customer_headers: dict,
        staff_headers: dict,
    ):
        """Staff endpoint approves a booking_requested agreement."""
        create_resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        agr_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/agreements/{agr_id}/approve-request",
            headers=staff_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending_payment"

        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.RESERVED

    def test_approve_already_pending_raises(
        self,
        client: TestClient,
        vehicle: Vehicle,
        registered_customer_headers: dict,
        staff_headers: dict,
    ):
        """Cannot approve an agreement that is not booking_requested."""
        create_resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        agr_id = create_resp.json()["id"]
        client.post(f"/api/agreements/{agr_id}/approve-request", headers=staff_headers)

        # Second approval attempt
        resp = client.post(
            f"/api/agreements/{agr_id}/approve-request",
            headers=staff_headers,
        )
        assert resp.status_code == 400

    def test_customer_cannot_approve_request(
        self,
        client: TestClient,
        vehicle: Vehicle,
        registered_customer_headers: dict,
    ):
        """A customer JWT is rejected on the staff approve-request endpoint."""
        create_resp = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": _future(3),
                "expected_return_datetime": _future(6),
            },
            headers=registered_customer_headers,
        )
        agr_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/agreements/{agr_id}/approve-request",
            headers=registered_customer_headers,
        )
        assert resp.status_code == 401
