"""Unit tests for vendor payable and settlement logic."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.core.errors import BusinessError, NotFoundError
from src.models.customer import Customer
from src.models.ledger_entry import PaymentMethod
from src.models.vendor import Vendor
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.services import agreement_service, vendor_service


@pytest.fixture
def customer(db: Session) -> Customer:
    customer = Customer(
        first_name="Nahom",
        last_name="Welde",
        phone_primary="0911333444",
        id_type="passport",
        id_number="PAS-9911",
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def _make_vehicle(db: Session, vendor: Vendor, plate_number: str, rate: Decimal) -> Vehicle:
    vehicle = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate_number,
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=rate,
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


class TestVendorPayableSummary:
    def test_summary_separates_reserved_and_earned_amounts(self, db: Session, vendor: Vendor, customer: Customer):
        active_vehicle = _make_vehicle(db, vendor, "AA-VP-001", Decimal("2000.00"))
        reserved_vehicle = _make_vehicle(db, vendor, "AA-VP-002", Decimal("1500.00"))
        active_start = datetime(2026, 4, 1, 9, 0, 0, tzinfo=timezone.utc)
        active_end = datetime(2026, 4, 4, 9, 0, 0, tzinfo=timezone.utc)
        reserved_start = datetime(2026, 4, 10, 9, 0, 0, tzinfo=timezone.utc)
        reserved_end = datetime(2026, 4, 12, 9, 0, 0, tzinfo=timezone.utc)

        active_agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=active_vehicle.id,
            pickup_datetime=active_start,
            expected_return_datetime=active_end,
            daily_rate=Decimal("2000.00"),
        )
        agreement_service.activate_agreement(db, active_agreement.id)

        agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=reserved_vehicle.id,
            pickup_datetime=reserved_start,
            expected_return_datetime=reserved_end,
            daily_rate=Decimal("1500.00"),
        )

        summary = vendor_service.get_vendor_payable_summary(db, vendor.id)
        assert summary["earned_amount"] == Decimal("6000.00")
        assert summary["reserved_amount"] == Decimal("3000.00")
        assert summary["paid_amount"] == Decimal("0")
        assert summary["outstanding_payable"] == Decimal("6000.00")
        assert summary["agreement_count"] == 2

    def test_summary_reduces_outstanding_after_vendor_payment(self, db: Session, vendor: Vendor, customer: Customer):
        vehicle = _make_vehicle(db, vendor, "AA-VP-003", Decimal("1800.00"))
        start = datetime(2026, 4, 1, 10, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 4, 3, 10, 0, 0, tzinfo=timezone.utc)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=start,
            expected_return_datetime=end,
            daily_rate=Decimal("1800.00"),
        )
        agreement_service.activate_agreement(db, agreement.id)

        vendor_service.post_vendor_payment(
            db=db,
            vendor_id=vendor.id,
            agreement_id=agreement.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
        )

        summary = vendor_service.get_vendor_payable_summary(db, vendor.id)
        assert summary["earned_amount"] == Decimal("3600.00")
        assert summary["paid_amount"] == Decimal("1000.00")
        assert summary["outstanding_payable"] == Decimal("2600.00")

    def test_nonexistent_vendor_raises(self, db: Session):
        with pytest.raises(NotFoundError):
            vendor_service.get_vendor_payable_summary(db, 99999)


class TestVendorPayments:
    def test_post_vendor_payment_records_payment(self, db: Session, vendor: Vendor):
        payment = vendor_service.post_vendor_payment(
            db=db,
            vendor_id=vendor.id,
            amount=Decimal("2500.00"),
            payment_method=PaymentMethod.CASH,
            notes="Partial settlement",
        )
        assert payment.amount == Decimal("2500.00")
        assert payment.vendor_id == vendor.id
        assert payment.payment_method == PaymentMethod.CASH

    def test_post_vendor_payment_validates_agreement_belongs_to_vendor(self, db: Session, vendor: Vendor, customer: Customer):
        other_vendor = Vendor(
            vendor_type="company",
            company_name="Other Vendor",
            phone_primary="0911444555",
            is_active=True,
        )
        db.add(other_vendor)
        db.commit()
        db.refresh(other_vendor)

        other_vehicle = _make_vehicle(db, other_vendor, "AA-VP-004", Decimal("1700.00"))
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=other_vehicle.id,
            pickup_datetime=datetime.now(timezone.utc) - timedelta(days=1),
            expected_return_datetime=datetime.now(timezone.utc) + timedelta(days=1),
            daily_rate=Decimal("1700.00"),
        )

        with pytest.raises(BusinessError):
            vendor_service.post_vendor_payment(
                db=db,
                vendor_id=vendor.id,
                agreement_id=agreement.id,
                amount=Decimal("1000.00"),
                payment_method=PaymentMethod.CASH,
            )

    def test_list_vendor_payments_returns_latest_first(self, db: Session, vendor: Vendor):
        first = vendor_service.post_vendor_payment(
            db=db,
            vendor_id=vendor.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
        )
        second = vendor_service.post_vendor_payment(
            db=db,
            vendor_id=vendor.id,
            amount=Decimal("500.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
        )

        payments = vendor_service.list_vendor_payments(db, vendor.id)
        assert [payment.id for payment in payments[:2]] == [second.id, first.id]
