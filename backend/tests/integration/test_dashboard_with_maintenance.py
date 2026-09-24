"""The dashboard must survive the data QA built up during section 7.

GET /api/dashboard started returning 503 after maintenance records with
next_due_date and next_due_mileage were logged, so this reproduces that
shape rather than a clean database.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.maintenance_record import MaintenanceRecord, MaintenanceType
from src.models.vehicle import Vehicle
from src.models.vendor import Vendor
from src.services import agreement_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


@pytest.fixture
def vehicle_with_service_history(db: Session, test_vehicle: Vehicle) -> Vehicle:
    """Three records, two carrying next-due fields — QA1003's shape."""
    test_vehicle.current_mileage = 60_500
    db.commit()

    now = datetime.now(timezone.utc)
    records = [
        MaintenanceRecord(
            vehicle_id=test_vehicle.id,
            service_type=MaintenanceType.OIL_CHANGE,
            description="QA service record",
            performed_at=now - timedelta(days=60),
            odometer=60_000,
            cost=Decimal("1200.00"),
            provider="QA Garage",
            next_due_date=now - timedelta(days=5),
            next_due_mileage=60_400,
        ),
        MaintenanceRecord(
            vehicle_id=test_vehicle.id,
            service_type=MaintenanceType.TIRE_REPLACEMENT,
            description="QA service record",
            performed_at=now - timedelta(days=30),
            odometer=60_400,
            cost=Decimal("8000.00"),
            provider="QA Garage",
            next_due_mileage=70_000,
        ),
        MaintenanceRecord(
            vehicle_id=test_vehicle.id,
            service_type=MaintenanceType.ROUTINE_SERVICE,
            description="QA service record",
            performed_at=now - timedelta(days=1),
            odometer=60_500,
            cost=Decimal("500.00"),
            provider="QA Garage",
            next_due_date=now + timedelta(days=90),
        ),
    ]
    db.add_all(records)
    db.commit()
    db.refresh(test_vehicle)
    return test_vehicle


class TestDashboardLoads:
    def test_it_returns_200_with_service_history_present(
        self, client, vehicle_with_service_history, auth_headers
    ):
        response = client.get("/api/dashboard", headers=auth_headers)
        assert response.status_code == 200, response.text

    def test_it_reports_the_fleet_rather_than_zeros(
        self, client, vehicle_with_service_history, auth_headers
    ):
        """Every tile read 0, including total vehicles, when the call failed."""
        body = client.get("/api/dashboard", headers=auth_headers).json()
        assert body["vehicles"]["total"] >= 1

    def test_it_survives_an_agreement_as_well(
        self, client, db: Session, vehicle_with_service_history, test_customer, auth_headers
    ):
        pickup = datetime.now(timezone.utc) + timedelta(days=2)
        agreement_service.create_standard_agreement(
            db=db,
            customer_id=test_customer.id,
            vehicle_id=vehicle_with_service_history.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=5),
            daily_rate=Decimal("1500.00"),
        )

        response = client.get("/api/dashboard", headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.json()["total_agreements"] >= 1

    def test_the_service_due_count_is_present(
        self, client, vehicle_with_service_history, auth_headers
    ):
        body = client.get("/api/dashboard", headers=auth_headers).json()
        assert "service_due" in body["vehicles"]
        assert isinstance(body["vehicles"]["service_due"], int)
