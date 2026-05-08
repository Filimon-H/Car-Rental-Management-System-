"""Unit tests for availability checking."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.vendor import Vendor
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.repositories import availability_repository


@pytest.fixture
def test_customer(db: Session) -> Customer:
    """Create a test customer."""
    customer = Customer(
        first_name="Test",
        last_name="Customer",
        phone_primary="0911000000",
        id_type="passport",
        id_number="AB123456",
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
        plate_number="TEST-001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=1500.00,
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@pytest.fixture
def test_vehicle_rented(db: Session, vendor: Vendor) -> Vehicle:
    """Create a rented vehicle."""
    vehicle = Vehicle(
        vendor_id=vendor.id,
        plate_number="TEST-002",
        plate_code="01",
        plate_city="AA",
        make="Honda",
        model="Civic",
        year=2021,
        color="Blue",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=1400.00,
        status=VehicleStatus.RENTED,
        is_active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


class TestCheckVehicleAvailable:
    """Test vehicle availability checking."""

    def test_available_vehicle_no_bookings(
        self, db: Session, test_vehicle: Vehicle
    ):
        """Vehicle with no bookings should be available."""
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=3)
        
        result = availability_repository.check_vehicle_available(
            db, test_vehicle.id, start, end
        )
        assert result is True

    def test_rented_vehicle_not_available(
        self, db: Session, test_vehicle_rented: Vehicle
    ):
        """Vehicle with RENTED status should not be available."""
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=3)
        
        result = availability_repository.check_vehicle_available(
            db, test_vehicle_rented.id, start, end
        )
        assert result is False

    def test_inactive_vehicle_not_available(
        self, db: Session, test_vehicle: Vehicle
    ):
        """Inactive vehicle should not be available."""
        test_vehicle.is_active = False
        db.commit()
        
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=3)
        
        result = availability_repository.check_vehicle_available(
            db, test_vehicle.id, start, end
        )
        assert result is False

    def test_nonexistent_vehicle_not_available(self, db: Session):
        """Nonexistent vehicle should not be available."""
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=3)
        
        result = availability_repository.check_vehicle_available(
            db, 99999, start, end
        )
        assert result is False

    def test_overlapping_booking_not_available(
        self, db: Session, test_vehicle: Vehicle, test_customer: Customer
    ):
        """Vehicle with overlapping booking should not be available."""
        # Create an existing agreement
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=5)
        
        agreement = Agreement(
            agreement_number="AGR-TEST-001",
            agreement_type=AgreementType.STANDARD,
            status=AgreementStatus.ACTIVE,
            customer_id=test_customer.id,
            pickup_datetime=start,
            expected_return_datetime=end,
            agreed_daily_rate=1500.00,
        )
        db.add(agreement)
        db.flush()
        
        segment = AgreementVehicleSegment(
            agreement_id=agreement.id,
            vehicle_id=test_vehicle.id,
            start_datetime=start,
            end_datetime=end,
            daily_rate=1500.00,
        )
        db.add(segment)
        db.commit()
        
        # Try to book overlapping period
        check_start = start + timedelta(days=2)
        check_end = end + timedelta(days=2)
        
        result = availability_repository.check_vehicle_available(
            db, test_vehicle.id, check_start, check_end
        )
        assert result is False

    def test_non_overlapping_booking_available(
        self, db: Session, test_vehicle: Vehicle, test_customer: Customer
    ):
        """Vehicle should be available for non-overlapping dates."""
        # Create an existing agreement
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=3)
        
        agreement = Agreement(
            agreement_number="AGR-TEST-002",
            agreement_type=AgreementType.STANDARD,
            status=AgreementStatus.ACTIVE,
            customer_id=test_customer.id,
            pickup_datetime=start,
            expected_return_datetime=end,
            agreed_daily_rate=1500.00,
        )
        db.add(agreement)
        db.flush()
        
        segment = AgreementVehicleSegment(
            agreement_id=agreement.id,
            vehicle_id=test_vehicle.id,
            start_datetime=start,
            end_datetime=end,
            daily_rate=1500.00,
        )
        db.add(segment)
        db.commit()
        
        # Check availability AFTER the existing booking
        check_start = end + timedelta(days=1)
        check_end = check_start + timedelta(days=3)
        
        result = availability_repository.check_vehicle_available(
            db, test_vehicle.id, check_start, check_end
        )
        assert result is True

    def test_closed_agreement_not_blocking(
        self, db: Session, test_vehicle: Vehicle, test_customer: Customer
    ):
        """Closed agreements should not block availability."""
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=5)
        
        agreement = Agreement(
            agreement_number="AGR-TEST-003",
            agreement_type=AgreementType.STANDARD,
            status=AgreementStatus.CLOSED,
            customer_id=test_customer.id,
            pickup_datetime=start,
            expected_return_datetime=end,
            agreed_daily_rate=1500.00,
        )
        db.add(agreement)
        db.flush()
        
        segment = AgreementVehicleSegment(
            agreement_id=agreement.id,
            vehicle_id=test_vehicle.id,
            start_datetime=start,
            end_datetime=end,
            daily_rate=1500.00,
        )
        db.add(segment)
        db.commit()
        
        # Same period should now be available since agreement is closed
        result = availability_repository.check_vehicle_available(
            db, test_vehicle.id, start, end
        )
        assert result is True

    def test_exclude_agreement_allows_extension(
        self, db: Session, test_vehicle: Vehicle, test_customer: Customer
    ):
        """Excluding an agreement should allow checking for extensions."""
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=5)
        
        agreement = Agreement(
            agreement_number="AGR-TEST-004",
            agreement_type=AgreementType.STANDARD,
            status=AgreementStatus.ACTIVE,
            customer_id=test_customer.id,
            pickup_datetime=start,
            expected_return_datetime=end,
            agreed_daily_rate=1500.00,
        )
        db.add(agreement)
        db.flush()
        
        segment = AgreementVehicleSegment(
            agreement_id=agreement.id,
            vehicle_id=test_vehicle.id,
            start_datetime=start,
            end_datetime=end,
            daily_rate=1500.00,
        )
        db.add(segment)
        db.commit()
        
        # Check overlapping but exclude this agreement (for extension)
        check_start = end - timedelta(days=1)
        check_end = end + timedelta(days=3)
        
        result = availability_repository.check_vehicle_available(
            db, test_vehicle.id, check_start, check_end,
            exclude_agreement_id=agreement.id
        )
        assert result is True
