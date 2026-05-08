"""Unit tests for availability checking."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

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


# ---------------------------------------------------------------------------
# Helpers for new tests
# ---------------------------------------------------------------------------

def _make_vehicle(db, vendor, plate, status=VehicleStatus.AVAILABLE, vtype=VehicleType.SEDAN):
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate,
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="White",
        vehicle_type=vtype,
        service_type="business",
        daily_rate=Decimal("1500.00"),
        status=status,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def _make_agreement_with_segment(db, customer, vehicle, start, end, status=AgreementStatus.ACTIVE):
    ag = Agreement(
        agreement_number=f"AGR-AV-{id(start)}",
        agreement_type=AgreementType.STANDARD,
        status=status,
        customer_id=customer.id,
        pickup_datetime=start,
        expected_return_datetime=end,
        agreed_daily_rate=Decimal("1500.00"),
    )
    db.add(ag)
    db.flush()
    seg = AgreementVehicleSegment(
        agreement_id=ag.id,
        vehicle_id=vehicle.id,
        start_datetime=start,
        end_datetime=end,
        daily_rate=Decimal("1500.00"),
    )
    db.add(seg)
    db.commit()
    db.refresh(ag)
    return ag


# ---------------------------------------------------------------------------
# get_available_vehicles
# ---------------------------------------------------------------------------

class TestGetAvailableVehicles:

    def test_returns_all_available_vehicles_in_empty_period(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v1 = _make_vehicle(db, vendor, "GV-001")
        v2 = _make_vehicle(db, vendor, "GV-002")
        start = datetime.now(timezone.utc) + timedelta(days=10)
        end = start + timedelta(days=3)
        result = availability_repository.get_available_vehicles(db, start, end)
        ids = [v.id for v in result]
        assert v1.id in ids
        assert v2.id in ids

    def test_excludes_booked_vehicle(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        booked = _make_vehicle(db, vendor, "GV-BOOKED")
        free = _make_vehicle(db, vendor, "GV-FREE")
        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(days=3)
        _make_agreement_with_segment(db, test_customer, booked, start, end)
        result = availability_repository.get_available_vehicles(db, start, end)
        ids = [v.id for v in result]
        assert booked.id not in ids
        assert free.id in ids

    def test_excludes_maintenance_vehicle(
        self, db: Session, vendor: Vendor
    ):
        in_maintenance = _make_vehicle(db, vendor, "GV-MAINT", status=VehicleStatus.MAINTENANCE)
        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(days=3)
        result = availability_repository.get_available_vehicles(db, start, end)
        ids = [v.id for v in result]
        assert in_maintenance.id not in ids

    def test_excludes_inactive_vehicle(
        self, db: Session, vendor: Vendor
    ):
        inactive = Vehicle(
            vendor_id=vendor.id,
            plate_number="GV-INACTIVE",
            plate_code="01",
            plate_city="AA",
            make="Ford",
            model="Focus",
            year=2020,
            color="Red",
            vehicle_type=VehicleType.SEDAN,
            service_type="business",
            daily_rate=Decimal("1000.00"),
            status=VehicleStatus.AVAILABLE,
            is_active=False,
        )
        db.add(inactive)
        db.commit()
        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(days=3)
        result = availability_repository.get_available_vehicles(db, start, end)
        ids = [v.id for v in result]
        assert inactive.id not in ids

    def test_closed_booking_does_not_block_vehicle(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GV-CLOSED")
        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(days=3)
        _make_agreement_with_segment(db, test_customer, v, start, end, status=AgreementStatus.CLOSED)
        result = availability_repository.get_available_vehicles(db, start, end)
        ids = [v.id for v in result]
        assert v.id in ids

    def test_vehicle_available_after_previous_booking_ends(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GV-AFTER")
        booking_start = datetime.now(timezone.utc) + timedelta(days=1)
        booking_end = booking_start + timedelta(days=3)
        _make_agreement_with_segment(db, test_customer, v, booking_start, booking_end)

        # Check availability AFTER the booking ends
        check_start = booking_end + timedelta(hours=1)
        check_end = check_start + timedelta(days=2)
        result = availability_repository.get_available_vehicles(db, check_start, check_end)
        ids = [v.id for v in result]
        assert v.id in ids

    def test_empty_fleet_returns_empty_list(self, db: Session):
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=2)
        result = availability_repository.get_available_vehicles(db, start, end)
        assert result == []


# ---------------------------------------------------------------------------
# get_vehicle_bookings
# ---------------------------------------------------------------------------

class TestGetVehicleBookings:

    def test_returns_active_booking_in_range(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GB-001")
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=3)
        ag = _make_agreement_with_segment(db, test_customer, v, start, end)

        results = availability_repository.get_vehicle_bookings(
            db, v.id, start - timedelta(days=1), end + timedelta(days=1)
        )
        assert len(results) == 1
        assert results[0]["agreement_id"] == ag.id

    def test_excludes_booking_outside_range(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GB-002")
        booking_start = datetime.now(timezone.utc) + timedelta(days=10)
        booking_end = booking_start + timedelta(days=3)
        _make_agreement_with_segment(db, test_customer, v, booking_start, booking_end)

        # Query a window that doesn't overlap
        query_start = datetime.now(timezone.utc) + timedelta(days=1)
        query_end = query_start + timedelta(days=3)
        results = availability_repository.get_vehicle_bookings(db, v.id, query_start, query_end)
        assert len(results) == 0

    def test_excludes_cancelled_booking(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GB-003")
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=3)
        _make_agreement_with_segment(db, test_customer, v, start, end, status=AgreementStatus.CANCELLED)

        results = availability_repository.get_vehicle_bookings(
            db, v.id, start - timedelta(days=1), end + timedelta(days=1)
        )
        assert len(results) == 0

    def test_includes_closed_booking(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GB-004")
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=3)
        _make_agreement_with_segment(db, test_customer, v, start, end, status=AgreementStatus.CLOSED)

        results = availability_repository.get_vehicle_bookings(
            db, v.id, start - timedelta(days=1), end + timedelta(days=1)
        )
        assert len(results) == 1

    def test_returns_booking_fields(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GB-005")
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(days=3)
        ag = _make_agreement_with_segment(db, test_customer, v, start, end)

        results = availability_repository.get_vehicle_bookings(
            db, v.id, start - timedelta(days=1), end + timedelta(days=1)
        )
        assert len(results) == 1
        entry = results[0]
        assert "agreement_id" in entry
        assert "agreement_number" in entry
        assert "start" in entry
        assert "end" in entry
        assert "status" in entry
        assert "customer_name" in entry

    def test_multiple_bookings_returned_in_range(
        self, db: Session, vendor: Vendor, test_customer: Customer
    ):
        v = _make_vehicle(db, vendor, "GB-006")
        b1_start = datetime.now(timezone.utc) + timedelta(days=1)
        b1_end = b1_start + timedelta(days=3)
        b2_start = b1_end + timedelta(days=1)
        b2_end = b2_start + timedelta(days=2)
        _make_agreement_with_segment(db, test_customer, v, b1_start, b1_end)
        _make_agreement_with_segment(db, test_customer, v, b2_start, b2_end)

        results = availability_repository.get_vehicle_bookings(
            db, v.id, b1_start - timedelta(days=1), b2_end + timedelta(days=1)
        )
        assert len(results) == 2

    def test_no_bookings_returns_empty_list(
        self, db: Session, vendor: Vendor
    ):
        v = _make_vehicle(db, vendor, "GB-007")
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=5)
        results = availability_repository.get_vehicle_bookings(db, v.id, start, end)
        assert results == []
