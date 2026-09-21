"""Integration tests for standard rental agreements."""

import csv
import io
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from tests.conftest import backdate_agreement
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.security import hash_password
from src.core.rbac import Role
from src.models.agreement import AgreementStatus
from src.models.customer import Customer
from src.models.ledger_entry import PaymentMethod
from src.models.staff_user import StaffUser
from src.models.vendor import Vendor
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.services import agreement_service, ledger_service


@pytest.fixture
def sales_user(db: Session) -> StaffUser:
    """Create a sales user for testing."""
    user = StaffUser(
        username="salesuser",
        email="sales@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Sales User",
        role=Role.SALES,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_customer(db: Session) -> Customer:
    """Create a test customer."""
    customer = Customer(
        first_name="John",
        last_name="Doe",
        phone_primary="0911123456",
        id_type="passport",
        id_number="EP123456",
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@pytest.fixture
def test_vehicle(db: Session, vendor: Vendor) -> Vehicle:
    """Create a test vehicle."""
    vehicle = Vehicle(
        vendor_id=vendor.id,
        plate_number="AA-12345",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="Silver",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1500.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@pytest.fixture
def auth_headers(client: TestClient, sales_user: StaffUser) -> dict:
    """Get auth headers for sales user."""
    response = client.post(
        "/api/auth/login",
        json={"username": "salesuser", "password": "testpass123"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestCreateStandardAgreement:
    """Test standard agreement creation flow."""

    def test_create_agreement_success(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
    ):
        """Successfully create a standard rental agreement."""
        pickup = datetime.now(timezone.utc) + timedelta(hours=1)
        return_dt = pickup + timedelta(days=3)
        
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=return_dt,
            daily_rate=Decimal("1500.00"),
            deposit_amount=Decimal("5000.00"),
            created_by_id=sales_user.id,
        )
        
        assert agreement.id is not None
        assert agreement.agreement_number.startswith("AGR-")
        assert agreement.status == AgreementStatus.PENDING_PAYMENT  # service creates as PENDING_PAYMENT
        assert agreement.customer_id == test_customer.id
        
        # Check vehicle segment created
        assert len(agreement.vehicle_segments) == 1
        segment = agreement.vehicle_segments[0]
        assert segment.vehicle_id == test_vehicle.id
        
        # Check vehicle status updated. Creating an agreement reserves the vehicle;
        # it only becomes RENTED at activation (handover).
        db.refresh(test_vehicle)
        assert test_vehicle.status == VehicleStatus.RESERVED
        
        # Check initial rental charge posted
        balance = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance == Decimal("4500.00")  # 3 days @ 1500

    def test_create_agreement_vehicle_not_available(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
    ):
        """Cannot create agreement for unavailable vehicle."""
        # Mark vehicle as maintenance
        test_vehicle.status = VehicleStatus.MAINTENANCE
        db.commit()
        
        pickup = datetime.now(timezone.utc) + timedelta(hours=1)
        return_dt = pickup + timedelta(days=3)
        
        with pytest.raises(Exception) as exc_info:
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=test_customer.id,
                vehicle_id=test_vehicle.id,
                pickup_datetime=pickup,
                expected_return_datetime=return_dt,
                daily_rate=Decimal("1500.00"),
            )
        
        assert "not available" in str(exc_info.value).lower()

    def test_create_agreement_invalid_dates(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
    ):
        """Cannot create agreement with return date before pickup."""
        pickup = datetime.now(timezone.utc) + timedelta(days=3)
        return_dt = pickup - timedelta(days=1)  # Before pickup!
        
        with pytest.raises(Exception) as exc_info:
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=test_customer.id,
                vehicle_id=test_vehicle.id,
                pickup_datetime=pickup,
                expected_return_datetime=return_dt,
                daily_rate=Decimal("1500.00"),
            )
        
        assert "after pickup" in str(exc_info.value).lower()


class TestCloseAgreement:
    """Test agreement closing flow."""

    def test_close_agreement_on_time(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
    ):
        """Close agreement returned on time."""
        # The car is already out, which a new booking cannot express: create it
        # legally, then backdate as the passage of time would.
        pickup = datetime.now(timezone.utc) - timedelta(days=3)
        expected_return = datetime.now(timezone.utc)
        lead = datetime.now(timezone.utc) + timedelta(days=1)

        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=lead,
            expected_return_datetime=lead + timedelta(days=3),
            daily_rate=Decimal("1500.00"),
        )
        backdate_agreement(db, agreement, pickup, expected_return)
        agreement_service.activate_agreement(db, agreement.id)
        
        # Close on time
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=agreement.id,
            actual_return_datetime=expected_return,
            closed_by_id=sales_user.id,
        )
        
        assert closed.status == AgreementStatus.CLOSED
        assert closed.actual_return_datetime.replace(tzinfo=timezone.utc) == expected_return
        
        # Vehicle should be available again
        db.refresh(test_vehicle)
        assert test_vehicle.status == VehicleStatus.AVAILABLE

    def test_close_agreement_late_charges_fee(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
    ):
        """Close agreement late should add late fee."""
        pickup = datetime.now(timezone.utc) - timedelta(days=5)
        expected_return = datetime.now(timezone.utc) - timedelta(days=2)
        actual_return = datetime.now(timezone.utc)  # 2 days late
        lead = datetime.now(timezone.utc) + timedelta(days=1)

        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=lead,
            expected_return_datetime=lead + timedelta(days=3),
            daily_rate=Decimal("1500.00"),
        )
        backdate_agreement(db, agreement, pickup, expected_return)
        agreement_service.activate_agreement(db, agreement.id)
        
        balance_before = ledger_service.get_agreement_balance(db, agreement.id)
        
        # Close late
        agreement_service.close_agreement(
            db=db,
            agreement_id=agreement.id,
            actual_return_datetime=actual_return,
        )
        
        balance_after = ledger_service.get_agreement_balance(db, agreement.id)
        
        # Late fee should have been added (2 days @ 1.5x rate = 4500)
        assert balance_after > balance_before


class TestPaymentFlow:
    """Test payment posting flow."""

    def test_post_payment_reduces_balance(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
    ):
        """Payment should reduce agreement balance."""
        pickup = datetime.now(timezone.utc) + timedelta(hours=1)
        return_dt = pickup + timedelta(days=2)
        
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=return_dt,
            daily_rate=Decimal("1500.00"),
        )
        
        initial_balance = ledger_service.get_agreement_balance(db, agreement.id)
        
        # Post payment
        from src.models.ledger_entry import PaymentMethod
        ledger_service.post_payment(
            db=db,
            agreement_id=agreement.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
        )
        
        final_balance = ledger_service.get_agreement_balance(db, agreement.id)
        
        assert final_balance == initial_balance - Decimal("1000.00")


class TestDoubleBookingPrevention:
    """Test that double booking is prevented."""

    def test_cannot_double_book_vehicle(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
    ):
        """Cannot book same vehicle for overlapping dates."""
        pickup1 = datetime.now(timezone.utc) + timedelta(days=1)
        return1 = pickup1 + timedelta(days=5)
        
        # First agreement
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup1,
            expected_return_datetime=return1,
            daily_rate=Decimal("1500.00"),
        )
        
        # Try overlapping booking
        pickup2 = pickup1 + timedelta(days=2)  # Overlaps!
        return2 = return1 + timedelta(days=2)
        
        with pytest.raises(Exception) as exc_info:
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=test_customer.id,
                vehicle_id=test_vehicle.id,
                pickup_datetime=pickup2,
                expected_return_datetime=return2,
                daily_rate=Decimal("1500.00"),
            )
        
        assert "not available" in str(exc_info.value).lower()

    def test_can_book_after_previous_agreement(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
    ):
        """Can book vehicle after previous agreement ends."""
        pickup1 = datetime.now(timezone.utc) + timedelta(days=1)
        return1 = pickup1 + timedelta(days=3)
        
        # First agreement
        first = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup1,
            expected_return_datetime=return1,
            daily_rate=Decimal("1500.00"),
        )
        agreement_service.activate_agreement(db, first.id)

        # The first rental has to have happened before it can be closed; a
        # return date in the future is not a real event.
        closed_at = datetime.now(timezone.utc)
        backdate_agreement(db, first, closed_at - timedelta(days=3), closed_at)

        # Close first agreement
        agreement_service.close_agreement(
            db=db,
            agreement_id=first.id,
            actual_return_datetime=closed_at,
        )
        
        # Book after
        pickup2 = return1 + timedelta(hours=1)
        return2 = pickup2 + timedelta(days=2)
        
        second = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup2,
            expected_return_datetime=return2,
            daily_rate=Decimal("1500.00"),
        )
        
        assert second.id is not None
        assert second.id != first.id


class TestListAgreementsSearch:
    """The `search` filter must span the whole result set, not just one page."""

    def _make_agreement(
        self,
        db: Session,
        customer: Customer,
        vehicle: Vehicle,
        user: StaffUser,
        day_offset: int = 0,
    ):
        # Offset each booking so reusing one vehicle doesn't trip the availability check.
        pickup = datetime.now(timezone.utc) + timedelta(days=day_offset, hours=1)
        return agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(hours=6),
            daily_rate=Decimal("1200.00"),
            deposit_amount=Decimal("3000.00"),
            created_by_id=user.id,
        )

    def test_search_matches_agreement_number(
        self,
        client: TestClient,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
        auth_headers: dict,
    ):
        agreement = self._make_agreement(db, test_customer, test_vehicle, sales_user)

        response = client.get(
            "/api/agreements",
            params={"search": agreement.agreement_number},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["agreement_number"] == agreement.agreement_number

    def test_search_matches_customer_full_name(
        self,
        client: TestClient,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
        auth_headers: dict,
    ):
        self._make_agreement(db, test_customer, test_vehicle, sales_user)

        # "John Doe" matches neither first_name nor last_name on its own.
        response = client.get(
            "/api/agreements", params={"search": "John Doe"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["total"] == 1

    def test_search_excludes_non_matching(
        self,
        client: TestClient,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
        auth_headers: dict,
    ):
        self._make_agreement(db, test_customer, test_vehicle, sales_user)

        response = client.get(
            "/api/agreements", params={"search": "Nonexistent"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["total"] == 0

    def test_search_finds_record_beyond_first_page(
        self,
        client: TestClient,
        db: Session,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
        auth_headers: dict,
    ):
        """The regression this filter exists to prevent: a match on a later page."""
        for i in range(3):
            customer = Customer(
                first_name=f"Filler{i}",
                last_name="Person",
                phone_primary=f"09111000{i:02d}",
                id_type="passport",
                id_number=f"FP{i:05d}",
                is_active=True,
            )
            db.add(customer)
            db.commit()
            db.refresh(customer)
            self._make_agreement(db, customer, test_vehicle, sales_user, day_offset=i)

        needle = Customer(
            first_name="Zenebech",
            last_name="Tesfaye",
            phone_primary="0911999999",
            id_type="passport",
            id_number="ZT99999",
            is_active=True,
        )
        db.add(needle)
        db.commit()
        db.refresh(needle)
        self._make_agreement(db, needle, test_vehicle, sales_user, day_offset=10)

        # page_size=1 guarantees the match is not on the first page by insertion order.
        response = client.get(
            "/api/agreements",
            params={"search": "Zenebech", "page": 1, "page_size": 1},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["customer_name"] == "Zenebech Tesfaye"


class TestLedgerCsvExport:
    """The CSV export must honour the same filters as the ledger views."""

    @pytest.fixture
    def agreement_with_entries(
        self,
        db: Session,
        test_customer: Customer,
        test_vehicle: Vehicle,
        sales_user: StaffUser,
    ):
        pickup = datetime.now(timezone.utc) + timedelta(hours=1)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=2),
            daily_rate=Decimal("1500.00"),
            deposit_amount=Decimal("4000.00"),
            created_by_id=sales_user.id,
        )
        ledger_service.post_payment(
            db=db,
            agreement_id=agreement.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.CASH,
            description="Part payment",
            created_by_id=sales_user.id,
        )
        db.commit()
        return agreement

    def test_export_returns_csv_attachment(
        self, client: TestClient, agreement_with_entries, auth_headers: dict
    ):
        response = client.get("/api/ledger/export/csv", headers=auth_headers)

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert "attachment" in response.headers["content-disposition"]

        rows = list(csv.reader(io.StringIO(response.text)))
        assert rows[0] == [
            "Entry ID", "Agreement ID", "Agreement Number", "Date", "Type",
            "Amount", "Description", "Payment Method", "Payment Reference", "Notes",
        ]
        assert len(rows) > 1

    def test_export_includes_agreement_number(
        self, client: TestClient, agreement_with_entries, auth_headers: dict
    ):
        response = client.get("/api/ledger/export/csv", headers=auth_headers)

        assert agreement_with_entries.agreement_number in response.text

    def test_export_filters_by_agreement(
        self, client: TestClient, agreement_with_entries, auth_headers: dict
    ):
        response = client.get(
            "/api/ledger/export/csv",
            params={"agreement_id": agreement_with_entries.id},
            headers=auth_headers,
        )

        assert response.status_code == 200
        rows = list(csv.reader(io.StringIO(response.text)))[1:]
        assert rows, "expected at least one entry for this agreement"
        assert all(row[1] == str(agreement_with_entries.id) for row in rows)

    def test_export_filters_out_non_matching_agreement(
        self, client: TestClient, agreement_with_entries, auth_headers: dict
    ):
        response = client.get(
            "/api/ledger/export/csv",
            params={"agreement_id": agreement_with_entries.id + 9999},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert list(csv.reader(io.StringIO(response.text)))[1:] == []

    def test_export_requires_authentication(self, client: TestClient):
        assert client.get("/api/ledger/export/csv").status_code == 401
