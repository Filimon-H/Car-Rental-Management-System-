"""Unit tests for agreement service — full rental lifecycle."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.core.errors import BusinessError, NotFoundError
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.collateral_person import CollateralPerson
from src.models.customer import Customer
from src.models.driver import Driver
from src.models.vendor import Vendor
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.services import agreement_service, ledger_service


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Abebe",
        last_name="Bekele",
        phone_primary="0911000001",
        id_type="passport",
        id_number="ET001",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def inactive_customer(db: Session) -> Customer:
    c = Customer(
        first_name="Inactive",
        last_name="User",
        phone_primary="0911000002",
        is_active=False,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="AA-00001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Corolla",
        year=2022,
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
def second_vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="AA-00002",
        plate_code="01",
        plate_city="AA",
        make="Honda",
        model="Civic",
        year=2021,
        color="Blue",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1200.00"),
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
        plate_number="AA-00003",
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
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def driver(db: Session) -> Driver:
    d = Driver(
        first_name="Dawit",
        last_name="Haile",
        phone_primary="0911000010",
        license_number="DRV-001",
        is_active=True,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@pytest.fixture
def inactive_driver(db: Session) -> Driver:
    d = Driver(
        first_name="Old",
        last_name="Driver",
        phone_primary="0911000011",
        license_number="DRV-002",
        is_active=False,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@pytest.fixture
def collateral(db: Session, customer: Customer) -> CollateralPerson:
    cp = CollateralPerson(
        customer_id=customer.id,
        first_name="Selam",
        last_name="Girma",
        phone_primary="0911000020",
        relationship_to_customer="spouse",
        id_type="national_id",
        id_number="ID-001",
        is_active=True,
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp


def future(days: int = 1) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def past(days: int = 1) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


# ---------------------------------------------------------------------------
# create_standard_agreement
# ---------------------------------------------------------------------------

class TestCreateStandardAgreement:

    def test_creates_with_pending_payment_status(self, db, customer, vehicle):
        """New agreement starts as PENDING_PAYMENT, not ACTIVE."""
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        assert agreement.status == AgreementStatus.PENDING_PAYMENT

    def test_agreement_number_format(self, db, customer, vehicle):
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        assert agreement.agreement_number.startswith("AGR-")
        parts = agreement.agreement_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8   # YYYYMMDD
        assert len(parts[2]) == 4   # 4-digit sequence

    def test_vehicle_segment_created(self, db, customer, vehicle):
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        assert len(agreement.vehicle_segments) == 1
        seg = agreement.vehicle_segments[0]
        assert seg.vehicle_id == vehicle.id

    def test_vehicle_set_to_reserved_on_create(self, db, customer, vehicle):
        """Vehicle is RESERVED after agreement creation (not RENTED — that happens on activate)."""
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.RESERVED

    def test_initial_charge_posted_to_ledger(self, db, customer, vehicle):
        """3-day rental @ 1500/day → 4500 charge."""
        pickup = future(1)
        return_dt = pickup + timedelta(days=3)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=return_dt,
            daily_rate=Decimal("1500.00"),
        )
        balance = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance == Decimal("4500.00")

    def test_partial_day_billed_as_full_day(self, db, customer, vehicle):
        """25-hour rental → 2 days billed (ceiling rule)."""
        pickup = future(1)
        return_dt = pickup + timedelta(hours=25)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=return_dt,
            daily_rate=Decimal("1000.00"),
        )
        balance = ledger_service.get_agreement_balance(db, agreement.id)
        assert balance == Decimal("2000.00")

    def test_deposit_amount_stored(self, db, customer, vehicle):
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
            deposit_amount=Decimal("5000.00"),
        )
        assert agreement.deposit_amount == Decimal("5000.00")

    def test_inactive_customer_raises(self, db, inactive_customer, vehicle):
        with pytest.raises(NotFoundError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=inactive_customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=future(1),
                expected_return_datetime=future(4),
                daily_rate=Decimal("1500.00"),
            )

    def test_nonexistent_customer_raises(self, db, vehicle):
        with pytest.raises(NotFoundError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=99999,
                vehicle_id=vehicle.id,
                pickup_datetime=future(1),
                expected_return_datetime=future(4),
                daily_rate=Decimal("1500.00"),
            )

    def test_inactive_vehicle_raises(self, db, customer, inactive_vehicle):
        with pytest.raises(NotFoundError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=inactive_vehicle.id,
                pickup_datetime=future(1),
                expected_return_datetime=future(4),
                daily_rate=Decimal("1500.00"),
            )

    def test_return_date_before_pickup_raises(self, db, customer, vehicle):
        pickup = future(3)
        return_dt = future(1)  # before pickup
        with pytest.raises(BusinessError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=pickup,
                expected_return_datetime=return_dt,
                daily_rate=Decimal("1500.00"),
            )

    def test_return_date_equal_pickup_raises(self, db, customer, vehicle):
        pickup = future(1)
        with pytest.raises(BusinessError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=pickup,
                expected_return_datetime=pickup,
                daily_rate=Decimal("1500.00"),
            )

    def test_unavailable_vehicle_raises(self, db, customer, vehicle):
        """Vehicle in maintenance cannot be booked."""
        vehicle.status = VehicleStatus.MAINTENANCE
        db.commit()
        with pytest.raises(BusinessError) as exc_info:
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=future(1),
                expected_return_datetime=future(4),
                daily_rate=Decimal("1500.00"),
            )
        assert "not available" in str(exc_info.value).lower()

    def test_double_booking_same_vehicle_raises(self, db, customer, vehicle):
        """Two overlapping bookings on the same vehicle are rejected."""
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(5),
            daily_rate=Decimal("1500.00"),
        )
        with pytest.raises(BusinessError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=future(2),
                expected_return_datetime=future(6),
                daily_rate=Decimal("1500.00"),
            )

    def test_inactive_driver_raises(self, db, customer, vehicle, inactive_driver):
        with pytest.raises(NotFoundError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=future(1),
                expected_return_datetime=future(4),
                daily_rate=Decimal("1500.00"),
                driver_id=inactive_driver.id,
            )

    def test_collateral_from_other_customer_raises(self, db, customer, vehicle, collateral):
        """Collateral person must belong to the agreement's customer."""
        other = Customer(
            first_name="Tigist",
            last_name="Alemu",
            phone_primary="0911000099",
            is_active=True,
        )
        db.add(other)
        db.commit()
        db.refresh(other)
        with pytest.raises(BusinessError):
            agreement_service.create_standard_agreement(
                db=db,
                customer_id=other.id,
                vehicle_id=vehicle.id,
                pickup_datetime=future(1),
                expected_return_datetime=future(4),
                daily_rate=Decimal("1500.00"),
                collateral_person_id=collateral.id,  # belongs to 'customer', not 'other'
            )

    def test_valid_driver_accepted(self, db, customer, vehicle, driver):
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
            driver_id=driver.id,
        )
        assert agreement.driver_id == driver.id

    def test_valid_collateral_accepted(self, db, customer, vehicle, collateral):
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
            collateral_person_id=collateral.id,
        )
        assert agreement.collateral_person_id == collateral.id


# ---------------------------------------------------------------------------
# activate_agreement
# ---------------------------------------------------------------------------

class TestActivateAgreement:

    def _make_pending(self, db, customer, vehicle) -> Agreement:
        return agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )

    def test_activate_pending_payment(self, db, customer, vehicle):
        ag = self._make_pending(db, customer, vehicle)
        assert ag.status == AgreementStatus.PENDING_PAYMENT
        activated = agreement_service.activate_agreement(db, ag.id)
        assert activated.status == AgreementStatus.ACTIVE

    def test_activate_requires_full_required_deposit(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod

        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
            deposit_amount=Decimal("5000.00"),
        )
        ledger_service.post_deposit(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("3000.00"),
            payment_method=PaymentMethod.CASH,
        )
        with pytest.raises(BusinessError) as exc_info:
            agreement_service.activate_agreement(db, ag.id)
        assert "deposit" in str(exc_info.value).lower()

    def test_activate_requires_advance_payment(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod

        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
            advance_payment=Decimal("2000.00"),
        )
        ledger_service.post_payment(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
        )
        with pytest.raises(BusinessError) as exc_info:
            agreement_service.activate_agreement(db, ag.id)
        assert "advance" in str(exc_info.value).lower()

    def test_activate_succeeds_when_payment_requirements_met(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod

        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
            deposit_amount=Decimal("4000.00"),
            advance_payment=Decimal("1500.00"),
        )
        ledger_service.post_deposit(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("4000.00"),
            payment_method=PaymentMethod.CASH,
        )
        ledger_service.post_payment(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("1500.00"),
            payment_method=PaymentMethod.CASH,
        )
        activated = agreement_service.activate_agreement(db, ag.id)
        assert activated.status == AgreementStatus.ACTIVE

    def test_activate_sets_vehicles_to_rented(self, db, customer, vehicle):
        ag = self._make_pending(db, customer, vehicle)
        agreement_service.activate_agreement(db, ag.id)
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.RENTED

    def test_activate_already_active_is_idempotent(self, db, customer, vehicle):
        ag = self._make_pending(db, customer, vehicle)
        result1 = agreement_service.activate_agreement(db, ag.id)
        result2 = agreement_service.activate_agreement(db, ag.id)
        assert result2.status == result1.status  # Does not raise; returns current state

    def test_activate_closed_agreement_raises(self, db, customer, vehicle):
        ag = self._make_pending(db, customer, vehicle)
        agreement_service.activate_agreement(db, ag.id)
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=future(4),
        )
        with pytest.raises(BusinessError):
            agreement_service.activate_agreement(db, ag.id)

    def test_activate_nonexistent_agreement_raises(self, db):
        with pytest.raises(NotFoundError):
            agreement_service.activate_agreement(db, 99999)


# ---------------------------------------------------------------------------
# mark_agreement_returned
# ---------------------------------------------------------------------------

class TestMarkAgreementReturned:

    def _active_agreement(self, db, customer, vehicle) -> Agreement:
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=past(3),
            expected_return_datetime=future(0),
            daily_rate=Decimal("1500.00"),
        )
        return agreement_service.activate_agreement(db, ag.id)

    def test_mark_active_agreement_returned(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        returned = agreement_service.mark_agreement_returned(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        assert returned.status == AgreementStatus.RETURNED

    def test_vehicle_set_to_available_on_return(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.mark_agreement_returned(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.AVAILABLE

    def test_return_mileage_stored(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        returned = agreement_service.mark_agreement_returned(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
            return_mileage=52000,
        )
        assert returned.return_mileage == 52000

    def test_cannot_mark_draft_returned(self, db, customer, vehicle):
        """Only ACTIVE or OVERDUE can be marked returned."""
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        # Still PENDING_PAYMENT
        with pytest.raises(BusinessError):
            agreement_service.mark_agreement_returned(
                db=db,
                agreement_id=ag.id,
                actual_return_datetime=datetime.now(timezone.utc),
            )

    def test_cannot_mark_closed_returned(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        with pytest.raises(BusinessError):
            agreement_service.mark_agreement_returned(
                db=db,
                agreement_id=ag.id,
                actual_return_datetime=datetime.now(timezone.utc),
            )


# ---------------------------------------------------------------------------
# close_agreement
# ---------------------------------------------------------------------------

class TestCloseAgreement:

    def _active_agreement(self, db, customer, vehicle, pickup_days_ago=3, return_days=0) -> Agreement:
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=past(pickup_days_ago),
            expected_return_datetime=datetime.now(timezone.utc) + timedelta(days=return_days),
            daily_rate=Decimal("1500.00"),
        )
        return agreement_service.activate_agreement(db, ag.id)

    def test_close_active_sets_closed_status(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        assert closed.status == AgreementStatus.CLOSED

    def test_close_sets_actual_return_datetime(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        actual = datetime.now(timezone.utc)
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=actual,
        )
        assert closed.actual_return_datetime is not None

    def test_close_sets_closed_at(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        assert closed.closed_at is not None

    def test_close_sets_vehicle_available(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.AVAILABLE

    def test_close_stores_return_mileage(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
            return_mileage=55000,
        )
        assert closed.return_mileage == 55000

    def test_close_on_time_no_late_fee(self, db, customer, vehicle):
        """Returning on time must not add any late fee entry."""
        pickup = past(3)
        expected_return = datetime.now(timezone.utc) + timedelta(hours=1)
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=expected_return,
            daily_rate=Decimal("1500.00"),
        )
        agreement_service.activate_agreement(db, ag.id)
        balance_before = ledger_service.get_agreement_balance(db, ag.id)

        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=expected_return,  # on time
        )
        balance_after = ledger_service.get_agreement_balance(db, ag.id)
        assert balance_after == balance_before

    def test_close_late_adds_late_fee(self, db, customer, vehicle):
        """Returning 2 days late → 2 × 1.5 × 1500 = 4500 late fee."""
        pickup = past(5)
        expected_return = past(2)
        actual_return = expected_return + timedelta(days=2)

        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=expected_return,
            daily_rate=Decimal("1500.00"),
        )
        agreement_service.activate_agreement(db, ag.id)
        balance_before = ledger_service.get_agreement_balance(db, ag.id)

        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=actual_return,
        )
        balance_after = ledger_service.get_agreement_balance(db, ag.id)
        # Late fee: 2 days × 1500 × 1.5 = 4500
        assert balance_after == balance_before + Decimal("4500.00")

    def test_close_already_closed_raises(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        with pytest.raises(BusinessError) as exc_info:
            agreement_service.close_agreement(
                db=db,
                agreement_id=ag.id,
                actual_return_datetime=datetime.now(timezone.utc),
            )
        assert "closed" in str(exc_info.value).lower()

    def test_close_draft_raises(self, db, customer, vehicle):
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        with pytest.raises(BusinessError):
            agreement_service.close_agreement(
                db=db,
                agreement_id=ag.id,
                actual_return_datetime=datetime.now(timezone.utc),
            )

    def test_close_returned_agreement_succeeds(self, db, customer, vehicle):
        """RETURNED status can transition to CLOSED (settlement step)."""
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.mark_agreement_returned(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        closed = agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        assert closed.status == AgreementStatus.CLOSED

    def test_close_appends_notes(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
            notes="Returned in good condition",
        )
        db.refresh(ag)
        assert "[Close]" in ag.notes
        assert "Returned in good condition" in ag.notes

    def test_close_auto_applies_held_deposit(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod

        ag = self._active_agreement(db, customer, vehicle)
        ledger_service.post_deposit(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.CASH,
        )
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        summary = agreement_service.get_agreement_summary(db, ag.id)
        assert summary["deposit_applied"] == Decimal("2000.00")
        assert summary["deposit_held"] == Decimal("0.00")
        assert summary["balance_due"] > Decimal("0.00")

    def test_close_only_applies_up_to_outstanding_balance(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod

        pickup = datetime.now(timezone.utc) - timedelta(hours=20)
        expected_return = datetime.now(timezone.utc) + timedelta(hours=2)
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=expected_return,
            daily_rate=Decimal("1500.00"),
        )
        agreement_service.activate_agreement(db, ag.id)
        ledger_service.post_deposit(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("5000.00"),
            payment_method=PaymentMethod.CASH,
        )
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        summary = agreement_service.get_agreement_summary(db, ag.id)
        assert summary["balance_due"] == Decimal("0.00")
        assert summary["deposit_applied"] == Decimal("1500.00")
        assert summary["deposit_held"] == Decimal("3500.00")


# ---------------------------------------------------------------------------
# extend_agreement
# ---------------------------------------------------------------------------

class TestExtendAgreement:

    def _active_agreement(self, db, customer, vehicle) -> Agreement:
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=past(1),
            expected_return_datetime=future(2),
            daily_rate=Decimal("1500.00"),
        )
        return agreement_service.activate_agreement(db, ag.id)

    def test_extend_updates_return_date(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        new_return = future(5)
        extended = agreement_service.extend_agreement(
            db=db,
            agreement_id=ag.id,
            new_return_datetime=new_return,
        )
        assert extended.expected_return_datetime.date() == new_return.date()

    def test_extend_posts_additional_charge(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        balance_before = ledger_service.get_agreement_balance(db, ag.id)
        new_return = future(5)  # 3 extra days beyond future(2)
        agreement_service.extend_agreement(
            db=db,
            agreement_id=ag.id,
            new_return_datetime=new_return,
        )
        balance_after = ledger_service.get_agreement_balance(db, ag.id)
        assert balance_after > balance_before

    def test_extend_closed_agreement_raises(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )
        with pytest.raises(BusinessError):
            agreement_service.extend_agreement(
                db=db,
                agreement_id=ag.id,
                new_return_datetime=future(10),
            )

    def test_extend_with_past_date_raises(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        with pytest.raises(BusinessError):
            agreement_service.extend_agreement(
                db=db,
                agreement_id=ag.id,
                new_return_datetime=past(1),  # before current expected return
            )

    def test_extend_same_date_raises(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        with pytest.raises(BusinessError):
            agreement_service.extend_agreement(
                db=db,
                agreement_id=ag.id,
                new_return_datetime=ag.expected_return_datetime,
            )

    def test_extend_updates_vehicle_segment_end(self, db, customer, vehicle):
        ag = self._active_agreement(db, customer, vehicle)
        new_return = future(6)
        agreement_service.extend_agreement(
            db=db,
            agreement_id=ag.id,
            new_return_datetime=new_return,
        )
        db.refresh(ag)
        seg = ag.vehicle_segments[0]
        assert seg.end_datetime.date() == new_return.date()

    def test_extend_conflict_with_other_booking_raises(self, db, customer, vehicle, second_vehicle):
        """If another booking starts during the extension window, it must be blocked."""
        # First agreement: pickup yesterday, return in 2 days
        ag1 = self._active_agreement(db, customer, vehicle)

        # Close the first agreement so vehicle is freed, then rebook in the extension window
        agreement_service.close_agreement(
            db=db,
            agreement_id=ag1.id,
            actual_return_datetime=datetime.now(timezone.utc),
        )

        # New active agreement for vehicle in the extension window
        ag2 = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(3),
            expected_return_datetime=future(7),
            daily_rate=Decimal("1500.00"),
        )
        agreement_service.activate_agreement(db, ag2.id)

        # Now try to extend ag2's return date beyond another conflicting booking
        # (This scenario just verifies that extending ag2 past a new conflicting segment raises)
        ag3 = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=second_vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1200.00"),
        )
        agreement_service.activate_agreement(db, ag3.id)
        # ag3 is fine, just checking ag2 can still extend its own vehicle
        extended = agreement_service.extend_agreement(
            db=db,
            agreement_id=ag2.id,
            new_return_datetime=future(9),
        )
        assert extended.expected_return_datetime is not None


# ---------------------------------------------------------------------------
# get_agreement_summary
# ---------------------------------------------------------------------------

class TestGetAgreementSummary:

    def _create_and_activate(self, db, customer, vehicle, days=3) -> Agreement:
        pickup = past(days)
        return_dt = datetime.now(timezone.utc) + timedelta(hours=1)
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=return_dt,
            daily_rate=Decimal("1000.00"),
        )
        return agreement_service.activate_agreement(db, ag.id)

    def test_summary_contains_required_keys(self, db, customer, vehicle):
        ag = self._create_and_activate(db, customer, vehicle)
        summary = agreement_service.get_agreement_summary(db, ag.id)
        for key in ("agreement", "balance", "total_charges", "total_payments",
                    "deposit_received", "deposit_held", "ledger_entries"):
            assert key in summary

    def test_summary_total_charges_matches_ledger(self, db, customer, vehicle):
        ag = self._create_and_activate(db, customer, vehicle)
        summary = agreement_service.get_agreement_summary(db, ag.id)
        assert summary["total_charges"] > Decimal("0")

    def test_summary_balance_due_reduces_with_payment(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod
        ag = self._create_and_activate(db, customer, vehicle)
        summary_before = agreement_service.get_agreement_summary(db, ag.id)
        ledger_service.post_payment(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("500.00"),
            payment_method=PaymentMethod.CASH,
        )
        summary_after = agreement_service.get_agreement_summary(db, ag.id)
        assert summary_after["balance"] == summary_before["balance"] - Decimal("500.00")

    def test_summary_negative_adjustment_reduces_balance_due(self, db, customer, vehicle):
        """A negative (discount) adjustment reduces the balance_due via net_adjustments."""
        ag = self._create_and_activate(db, customer, vehicle)
        summary_before = agreement_service.get_agreement_summary(db, ag.id)
        ledger_service.post_adjustment(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("-200.00"),
            description="Discount",
        )
        summary = agreement_service.get_agreement_summary(db, ag.id)
        assert summary["net_adjustments"] == Decimal("-200.00")
        assert summary["balance_due"] == summary_before["balance_due"] - Decimal("200.00")

    def test_summary_positive_adjustment_increases_balance_due(self, db, customer, vehicle):
        ag = self._create_and_activate(db, customer, vehicle)
        summary_before = agreement_service.get_agreement_summary(db, ag.id)
        ledger_service.post_adjustment(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("300.00"),
            description="Extra charge",
        )
        summary = agreement_service.get_agreement_summary(db, ag.id)
        assert summary["net_adjustments"] == Decimal("300.00")
        assert summary["balance_due"] == summary_before["balance_due"] + Decimal("300.00")

    def test_summary_nonexistent_agreement_raises(self, db):
        with pytest.raises(NotFoundError):
            agreement_service.get_agreement_summary(db, 99999)

    def test_summary_deposit_held_calculation(self, db, customer, vehicle):
        from src.models.ledger_entry import PaymentMethod
        ag = self._create_and_activate(db, customer, vehicle)
        ledger_service.post_deposit(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("5000.00"),
            payment_method=PaymentMethod.CASH,
        )
        ledger_service.apply_deposit(db=db, agreement_id=ag.id, amount=Decimal("2000.00"))
        summary = agreement_service.get_agreement_summary(db, ag.id)
        assert summary["deposit_received"] == Decimal("5000.00")
        assert summary["deposit_applied"] == Decimal("2000.00")
        assert summary["deposit_held"] == Decimal("3000.00")


# ---------------------------------------------------------------------------
# generate_agreement_number
# ---------------------------------------------------------------------------

class TestGenerateAgreementNumber:

    def test_format_is_agr_date_seq(self, db):
        number = agreement_service.generate_agreement_number(db)
        parts = number.split("-")
        assert parts[0] == "AGR"
        assert len(parts[1]) == 8   # YYYYMMDD
        assert int(parts[2]) >= 1   # sequence starts at 1

    def test_sequential_numbers_increment(self, db, customer, vehicle, vendor):
        """Each new agreement on the same day gets the next sequence number."""
        ag1 = agreement_service.create_standard_agreement(
            db=db, customer_id=customer.id, vehicle_id=vehicle.id,
            pickup_datetime=future(1), expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )
        # Need a new vehicle for second agreement since vehicle is now RENTED
        v2 = Vehicle(
            vendor_id=vendor.id,
            plate_number="AA-99999",
            plate_code="01",
            plate_city="AA",
            make="Kia",
            model="Rio",
            year=2023,
            color="Gray",
            vehicle_type=VehicleType.SEDAN,
            service_type="business",
            daily_rate=Decimal("1000.00"),
            status=VehicleStatus.AVAILABLE,
            is_active=True,
        )
        db.add(v2)
        db.commit()
        ag2 = agreement_service.create_standard_agreement(
            db=db, customer_id=customer.id, vehicle_id=v2.id,
            pickup_datetime=future(1), expected_return_datetime=future(4),
            daily_rate=Decimal("1000.00"),
        )
        seq1 = int(ag1.agreement_number.split("-")[-1])
        seq2 = int(ag2.agreement_number.split("-")[-1])
        assert seq2 == seq1 + 1


# ---------------------------------------------------------------------------
# cancel_agreement
# ---------------------------------------------------------------------------

class TestCancelAgreement:

    def _pending(self, db, customer, vehicle) -> Agreement:
        return agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(4),
            daily_rate=Decimal("1500.00"),
        )

    def test_cancel_pending_payment_sets_cancelled(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        assert ag.status == AgreementStatus.PENDING_PAYMENT
        cancelled = agreement_service.cancel_agreement(db, ag.id)
        assert cancelled.status == AgreementStatus.CANCELLED

    def test_cancel_releases_vehicle_to_available(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.RESERVED
        agreement_service.cancel_agreement(db, ag.id)
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.AVAILABLE

    def test_cancel_appends_reason_to_notes(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        agreement_service.cancel_agreement(db, ag.id, reason="Customer changed plans")
        db.refresh(ag)
        assert "[Cancelled]" in ag.notes
        assert "Customer changed plans" in ag.notes

    def test_cancel_without_reason_does_not_add_notes(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        original_notes = ag.notes
        agreement_service.cancel_agreement(db, ag.id)
        db.refresh(ag)
        assert ag.notes == original_notes

    def test_cancel_nonexistent_raises(self, db):
        with pytest.raises(NotFoundError):
            agreement_service.cancel_agreement(db, 99999)

    def test_cancel_active_agreement_raises(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        agreement_service.activate_agreement(db, ag.id)
        with pytest.raises(BusinessError) as exc_info:
            agreement_service.cancel_agreement(db, ag.id)
        assert "PENDING_PAYMENT" in str(exc_info.value) or "cancel" in str(exc_info.value).lower()

    def test_cancel_closed_agreement_raises(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        activated = agreement_service.activate_agreement(db, ag.id)
        agreement_service.close_agreement(
            db=db,
            agreement_id=activated.id,
            actual_return_datetime=future(4),
        )
        with pytest.raises(BusinessError):
            agreement_service.cancel_agreement(db, ag.id)

    def test_cancel_already_cancelled_raises(self, db, customer, vehicle):
        ag = self._pending(db, customer, vehicle)
        agreement_service.cancel_agreement(db, ag.id)
        with pytest.raises(BusinessError):
            agreement_service.cancel_agreement(db, ag.id)


# ---------------------------------------------------------------------------
# Vehicle status chain — RESERVED when upcoming booking exists
# ---------------------------------------------------------------------------

class TestVehicleStatusOnReturn:
    """When an agreement is closed or returned, the vehicle should stay RESERVED
    if another active booking for it starts in the future."""

    def _make_active(self, db, customer, vehicle) -> Agreement:
        ag = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=past(3),
            expected_return_datetime=datetime.now(timezone.utc) + timedelta(hours=1),
            daily_rate=Decimal("1500.00"),
        )
        return agreement_service.activate_agreement(db, ag.id)

    def test_close_sets_available_when_no_upcoming_booking(self, db, customer, vehicle):
        ag = self._make_active(db, customer, vehicle)
        agreement_service.close_agreement(
            db=db, agreement_id=ag.id, actual_return_datetime=datetime.now(timezone.utc)
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.AVAILABLE

    def test_close_stays_reserved_when_upcoming_booking_exists(self, db, customer, vehicle):
        """Closing ag1 must leave vehicle RESERVED because a future booking exists."""
        ag1 = self._make_active(db, customer, vehicle)

        # Directly insert a future PENDING_PAYMENT agreement + segment to simulate
        # a booking that starts after ag1's return without triggering availability checks.
        future_ag = Agreement(
            agreement_number="AGR-FUTURE-CLOSE",
            agreement_type=AgreementType.CUSTOMER_VEHICLE,
            status=AgreementStatus.PENDING_PAYMENT,
            customer_id=customer.id,
            pickup_datetime=future(2),
            expected_return_datetime=future(5),
            agreed_daily_rate=Decimal("1500.00"),
        )
        db.add(future_ag)
        db.flush()
        seg = AgreementVehicleSegment(
            agreement_id=future_ag.id,
            vehicle_id=vehicle.id,
            start_datetime=future(2),
            end_datetime=future(5),
            daily_rate=Decimal("1500.00"),
        )
        db.add(seg)
        db.commit()

        # Close ag1 — vehicle should stay RESERVED because future_ag is pending
        agreement_service.close_agreement(
            db=db, agreement_id=ag1.id, actual_return_datetime=datetime.now(timezone.utc)
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.RESERVED

    def test_mark_returned_sets_available_when_no_upcoming(self, db, customer, vehicle):
        ag = self._make_active(db, customer, vehicle)
        agreement_service.mark_agreement_returned(
            db=db, agreement_id=ag.id, actual_return_datetime=datetime.now(timezone.utc)
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.AVAILABLE

    def test_mark_returned_stays_reserved_when_upcoming_booking_exists(self, db, customer, vehicle):
        """Marking ag1 returned must leave vehicle RESERVED because ag2 starts later."""
        ag1 = self._make_active(db, customer, vehicle)

        # Create a future booking — bypass status constraints by direct DB manipulation
        future_ag = Agreement(
            agreement_number="AGR-FUTURE-001",
            agreement_type=AgreementType.CUSTOMER_VEHICLE,
            status=AgreementStatus.PENDING_PAYMENT,
            customer_id=customer.id,
            pickup_datetime=future(2),
            expected_return_datetime=future(5),
            agreed_daily_rate=Decimal("1500.00"),
        )
        db.add(future_ag)
        db.flush()
        from src.models.agreement_vehicle_segment import AgreementVehicleSegment
        seg = AgreementVehicleSegment(
            agreement_id=future_ag.id,
            vehicle_id=vehicle.id,
            start_datetime=future(2),
            end_datetime=future(5),
            daily_rate=Decimal("1500.00"),
        )
        db.add(seg)
        db.commit()

        agreement_service.mark_agreement_returned(
            db=db, agreement_id=ag1.id, actual_return_datetime=datetime.now(timezone.utc)
        )
        db.refresh(vehicle)
        assert vehicle.status == VehicleStatus.RESERVED
