"""Integration tests for standard rental agreements."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.security import hash_password
from src.core.rbac import Role
from src.models.agreement import AgreementStatus
from src.models.customer import Customer
from src.models.staff_user import StaffUser
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
        full_name="John Doe",
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
def test_vehicle(db: Session) -> Vehicle:
    """Create a test vehicle."""
    vehicle = Vehicle(
        plate_number="AA-12345",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="Silver",
        vehicle_type=VehicleType.SEDAN,
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
        assert agreement.status == AgreementStatus.ACTIVE
        assert agreement.customer_id == test_customer.id
        
        # Check vehicle segment created
        assert len(agreement.vehicle_segments) == 1
        segment = agreement.vehicle_segments[0]
        assert segment.vehicle_id == test_vehicle.id
        
        # Check vehicle status updated
        db.refresh(test_vehicle)
        assert test_vehicle.status == VehicleStatus.RENTED
        
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
        pickup = datetime.now(timezone.utc) - timedelta(days=3)
        expected_return = datetime.now(timezone.utc)
        
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=expected_return,
            daily_rate=Decimal("1500.00"),
        )
        
        # Close on time
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=agreement.id,
            actual_return_datetime=expected_return,
            closed_by_id=sales_user.id,
        )
        
        assert closed.status == AgreementStatus.CLOSED
        assert closed.actual_return_datetime == expected_return
        
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
        
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=test_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=expected_return,
            daily_rate=Decimal("1500.00"),
        )
        
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
        pickup = datetime.now(timezone.utc)
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
        
        # Close first agreement
        agreement_service.close_agreement(
            db=db,
            agreement_id=first.id,
            actual_return_datetime=return1,
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
