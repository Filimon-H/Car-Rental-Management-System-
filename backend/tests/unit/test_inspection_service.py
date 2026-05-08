"""Unit tests for inspection-driven business logic."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.core.errors import BusinessError
from src.models.customer import Customer
from src.models.inspection import Inspection
from src.models.vendor import Vendor
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.services import agreement_service, inspection_service, ledger_service


@pytest.fixture
def customer(db: Session) -> Customer:
    customer = Customer(
        first_name="Marta",
        last_name="Kassaye",
        phone_primary="0911222333",
        id_type="passport",
        id_number="P-7788",
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@pytest.fixture
def vehicle(db: Session, vendor: Vendor) -> Vehicle:
    vehicle = Vehicle(
        vendor_id=vendor.id,
        plate_number="AA-55555",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2021,
        color="Silver",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1200.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@pytest.fixture
def active_agreement(db: Session, customer: Customer, vehicle: Vehicle):
    agreement = agreement_service.create_standard_agreement(
        db=db,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        pickup_datetime=datetime.now(timezone.utc) - timedelta(days=2),
        expected_return_datetime=datetime.now(timezone.utc) + timedelta(hours=2),
        daily_rate=Decimal("1200.00"),
    )
    agreement_service.activate_agreement(db, agreement.id)
    return agreement


def test_sign_return_inspection_marks_agreement_returned(db: Session, active_agreement, vehicle: Vehicle):
    inspection = Inspection(
        agreement_id=active_agreement.id,
        vehicle_id=vehicle.id,
        inspection_type="return",
        inspection_datetime=datetime.now(timezone.utc),
        mileage=54321,
        damage_records=[],
        checklist_results={},
        status="completed",
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)

    signed = inspection_service.sign_inspection(
        db=db,
        inspection=inspection,
        customer_name="Marta Kassaye",
    )

    db.refresh(active_agreement)
    db.refresh(vehicle)
    assert signed.status == "signed"
    assert active_agreement.status.value == "returned"
    assert active_agreement.return_mileage == 54321
    assert vehicle.status == VehicleStatus.AVAILABLE
    assert vehicle.current_mileage == 54321


def test_sign_return_inspection_posts_damage_charge(db: Session, active_agreement, vehicle: Vehicle):
    inspection = Inspection(
        agreement_id=active_agreement.id,
        vehicle_id=vehicle.id,
        inspection_type="return",
        inspection_datetime=datetime.now(timezone.utc),
        damage_records=[
            {
                "id": "damage-1",
                "category": "scratch",
                "location": "front_left",
                "severity": "minor",
                "estimated_cost": 1800,
            }
        ],
        checklist_results={},
        status="completed",
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)

    balance_before = ledger_service.get_agreement_balance(db, active_agreement.id)
    inspection_service.sign_inspection(
        db=db,
        inspection=inspection,
        customer_name="Marta Kassaye",
    )
    balance_after = ledger_service.get_agreement_balance(db, active_agreement.id)
    assert balance_after == balance_before + Decimal("1800")


def test_signing_twice_raises(db: Session, active_agreement, vehicle: Vehicle):
    inspection = Inspection(
        agreement_id=active_agreement.id,
        vehicle_id=vehicle.id,
        inspection_type="return",
        inspection_datetime=datetime.now(timezone.utc),
        damage_records=[],
        checklist_results={},
        status="signed",
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)

    with pytest.raises(BusinessError):
        inspection_service.sign_inspection(
            db=db,
            inspection=inspection,
            customer_name="Marta Kassaye",
        )
