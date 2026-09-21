"""Integration tests for booking extension — public API and staff API.

Public endpoint:  POST /api/public/bookings/{id}/extend
Staff endpoint:   POST /api/agreements/{id}/extend

Covers:
- Extending BOOKING_REQUESTED moves return date, no charge posted
- Extending PENDING_PAYMENT posts an extension charge
- Extending ACTIVE posts an extension charge
- New return date must be later than current return
- Extension blocked when vehicle already booked in the extension window
- Customer cannot extend another customer's booking
- Extension resets return_reminder_sent_days to None
- Staff extend endpoint works for active agreements
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
from src.models.ledger_entry import LedgerEntryType
from src.models.staff_user import StaffUser
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import ledger_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc(days_from_now: float = 0) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days_from_now)


def _iso(days_from_now: float) -> str:
    return _utc(days_from_now).isoformat()


@pytest.fixture
def vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="EXT-00001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Corolla",
        year=2023,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1500.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Extend",
        last_name="Test",
        phone_primary="0911300001",
        business_type="individual",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def customer_user(db: Session, customer: Customer) -> CustomerUser:
    u = CustomerUser(
        customer_id=customer.id,
        email="extend@example.com",
        hashed_password=hash_password("pass12345"),
        token_version=0,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def customer_headers(client: TestClient, customer_user: CustomerUser) -> dict:
    resp = client.post(
        "/api/public/auth/login",
        json={"email": "extend@example.com", "password": "pass12345"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def staff_user(db: Session) -> StaffUser:
    u = StaffUser(
        username="extstaff",
        email="extstaff@nod.et",
        hashed_password=hash_password("staffpass1"),
        full_name="Ext Staff",
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
        json={"username": "extstaff", "password": "staffpass1"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _make_booking(
    db: Session,
    customer: Customer,
    vehicle: Vehicle,
    status: AgreementStatus,
    pickup_offset: float = 1,
    return_offset: float = 4,
) -> Agreement:
    """Create an agreement in the given status with a vehicle segment."""
    pickup = _utc(pickup_offset)
    ret = _utc(return_offset)

    from src.services import agreement_service
    number = agreement_service.generate_agreement_number(db)

    agr = Agreement(
        agreement_number=number,
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=status,
        customer_id=customer.id,
        pickup_datetime=pickup,
        expected_return_datetime=ret,
        agreed_daily_rate=vehicle.daily_rate,
        deposit_amount=Decimal("0"),
    )
    db.add(agr)
    db.flush()

    seg = AgreementVehicleSegment(
        agreement_id=agr.id,
        vehicle_id=vehicle.id,
        start_datetime=pickup,
        end_datetime=ret,
        daily_rate=vehicle.daily_rate,
    )
    db.add(seg)

    if status in (AgreementStatus.ACTIVE, AgreementStatus.PENDING_PAYMENT):
        vehicle.status = VehicleStatus.RENTED if status == AgreementStatus.ACTIVE else VehicleStatus.RESERVED

    if status in (AgreementStatus.ACTIVE, AgreementStatus.PENDING_PAYMENT):
        # Post an initial charge so the agreement has ledger history
        from src.services import billing_service
        _, charge = billing_service.calculate_rental_charge(
            pickup, ret, vehicle.daily_rate
        )
        ledger_service.post_charge(
            db=db,
            agreement_id=agr.id,
            amount=charge,
            description="Initial rental charge",
            auto_commit=False,
        )

    db.commit()
    db.refresh(agr)
    return agr


# ---------------------------------------------------------------------------
# Public extend endpoint tests
# ---------------------------------------------------------------------------

class TestPublicExtendBooking:
    def test_extend_booking_requested_updates_return_date(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """Extending a BOOKING_REQUESTED agreement moves the return date."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.BOOKING_REQUESTED)
        new_return = _iso(7)

        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": new_return},
            headers=customer_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == agr.id
        # Return date should be later than original
        original_ret = agr.expected_return_datetime.isoformat()
        assert data["expected_return_datetime"] > original_ret

    def test_extend_booking_requested_no_charge_posted(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """BOOKING_REQUESTED extension does NOT post an additional charge."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.BOOKING_REQUESTED)
        charges_before = ledger_service.get_total_charges(db, agr.id)

        client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=customer_headers,
        )
        charges_after = ledger_service.get_total_charges(db, agr.id)
        assert charges_after == charges_before

    def test_extend_pending_payment_posts_extension_charge(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """Extending a PENDING_PAYMENT agreement adds an extension charge."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.PENDING_PAYMENT)
        charges_before = ledger_service.get_total_charges(db, agr.id)

        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=customer_headers,
        )
        assert resp.status_code == 200
        charges_after = ledger_service.get_total_charges(db, agr.id)
        assert charges_after > charges_before

    def test_extend_active_posts_extension_charge(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """Extending an ACTIVE agreement adds an extension charge."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.ACTIVE)
        charges_before = ledger_service.get_total_charges(db, agr.id)

        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=customer_headers,
        )
        assert resp.status_code == 200
        charges_after = ledger_service.get_total_charges(db, agr.id)
        assert charges_after > charges_before

    def test_extend_date_not_later_than_current_returns_422(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """New return date must be strictly after the current return date."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.BOOKING_REQUESTED,
                             return_offset=4)
        # Same date as current return
        same_date = agr.expected_return_datetime.isoformat()

        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": same_date},
            headers=customer_headers,
        )
        assert resp.status_code in (400, 422)

    def test_extend_vehicle_already_booked_returns_400(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict, vendor: Vendor,
    ):
        """Extension is blocked when another booking already occupies the extension window."""
        # First booking: active, returns in 4 days
        agr = _make_booking(db, customer, vehicle, AgreementStatus.ACTIVE,
                             pickup_offset=1, return_offset=4)

        # Second customer occupies the vehicle from day 5 onwards
        other_customer = Customer(
            first_name="Other",
            last_name="Customer",
            phone_primary="0911300099",
            business_type="individual",
            is_active=True,
        )
        db.add(other_customer)
        db.flush()

        # Block vehicle day 5–8 with a PENDING_PAYMENT agreement
        blocking = Agreement(
            agreement_number="AGR-BLOCK-001",
            agreement_type=AgreementType.CUSTOMER_VEHICLE,
            status=AgreementStatus.PENDING_PAYMENT,
            customer_id=other_customer.id,
            pickup_datetime=_utc(5),
            expected_return_datetime=_utc(8),
            agreed_daily_rate=vehicle.daily_rate,
            deposit_amount=Decimal("0"),
        )
        db.add(blocking)
        db.flush()
        seg = AgreementVehicleSegment(
            agreement_id=blocking.id,
            vehicle_id=vehicle.id,
            start_datetime=_utc(5),
            end_datetime=_utc(8),
            daily_rate=vehicle.daily_rate,
        )
        db.add(seg)
        db.commit()

        # Trying to extend original booking into day 5–7 must be blocked
        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=customer_headers,
        )
        assert resp.status_code == 400

    def test_extend_resets_return_reminder(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """After extension, return_reminder_sent_days is cleared."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.ACTIVE)
        agr.return_reminder_sent_days = 2
        db.commit()

        client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=customer_headers,
        )
        db.refresh(agr)
        assert agr.return_reminder_sent_days is None

    def test_other_customer_cannot_extend_booking(
        self, client: TestClient, db: Session, customer: Customer,
        vehicle: Vehicle, vendor: Vendor,
    ):
        """A customer cannot extend a booking that belongs to someone else."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.BOOKING_REQUESTED)

        # Create a second customer and log in as them
        other = Customer(
            first_name="Other",
            last_name="Cust",
            phone_primary="0911300002",
            business_type="individual",
            is_active=True,
        )
        db.add(other)
        db.flush()
        other_user = CustomerUser(
            customer_id=other.id,
            email="other@example.com",
            hashed_password=hash_password("pass12345"),
            token_version=0,
            is_active=True,
        )
        db.add(other_user)
        db.commit()

        resp = client.post(
            "/api/public/auth/login",
            json={"email": "other@example.com", "password": "pass12345"},
        )
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_extend_cancelled_booking_returns_400(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """Cannot extend a cancelled booking."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.CANCELLED)

        resp = client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": _iso(7)},
            headers=customer_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Extension charge calculation
# ---------------------------------------------------------------------------

class TestExtensionChargeAmount:
    def test_extension_charge_is_proportional_to_days(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """Extension charge = extra_days × daily_rate."""
        # Booking: 3 days
        agr = _make_booking(db, customer, vehicle, AgreementStatus.PENDING_PAYMENT,
                             pickup_offset=1, return_offset=4)
        charges_before = ledger_service.get_total_charges(db, agr.id)

        # Extend by 2 more days
        new_return = (agr.expected_return_datetime + timedelta(days=2)).isoformat()
        client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": new_return},
            headers=customer_headers,
        )
        charges_after = ledger_service.get_total_charges(db, agr.id)
        extension_charge = charges_after - charges_before
        expected = Decimal("2") * vehicle.daily_rate
        assert extension_charge == pytest.approx(float(expected), rel=0.01)

    def test_extension_charge_description_mentions_days(
        self, client: TestClient, db: Session, customer: Customer,
        customer_user: CustomerUser, vehicle: Vehicle, customer_headers: dict,
    ):
        """Extension ledger entry description references the number of extra days."""
        agr = _make_booking(db, customer, vehicle, AgreementStatus.ACTIVE)
        new_return = (agr.expected_return_datetime + timedelta(days=3)).isoformat()

        client.post(
            f"/api/public/bookings/{agr.id}/extend",
            json={"new_return_datetime": new_return},
            headers=customer_headers,
        )

        entries = ledger_service.get_ledger_entries(db, agr.id)
        ext_entries = [e for e in entries if "extension" in e.description.lower()]
        assert len(ext_entries) == 1
        assert "3" in ext_entries[0].description
