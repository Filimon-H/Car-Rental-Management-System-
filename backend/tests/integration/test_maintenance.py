"""Maintenance history, next-due detection, and permission gating."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.staff_user import StaffUser
from src.services import maintenance_service
from src.models.maintenance_record import MaintenanceType

from tests.integration.test_agreements_standard import test_vehicle  # noqa: F401


def _user(db: Session, username: str, role: Role) -> StaffUser:
    u = StaffUser(username=username, email=f"{username}@e.com", full_name=username,
                  hashed_password=hash_password("testpass123"), role=role, is_active=True)
    db.add(u); db.commit()
    return u


def _headers(client: TestClient, username: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestMaintenanceCrud:
    def test_create_and_list(self, client: TestClient, db: Session, test_vehicle):  # noqa: F811
        _user(db, "fleet_m", Role.FLEET)
        h = _headers(client, "fleet_m")
        r = client.post(f"/api/maintenance/vehicles/{test_vehicle.id}", headers=h, json={
            "service_type": "oil_change",
            "performed_at": datetime.now(timezone.utc).isoformat(),
            "description": "10k service",
            "odometer": 10000,
            "cost": "2500.00",
            "provider": "Moenco",
        })
        assert r.status_code == 201, r.text
        assert r.json()["description"] == "10k service"

        listed = client.get(f"/api/maintenance/vehicles/{test_vehicle.id}", headers=h)
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    def test_odometer_updates_vehicle_mileage(self, client: TestClient, db: Session, test_vehicle):  # noqa: F811
        """A service reading is the freshest odometer known for the vehicle."""
        _user(db, "fleet_odo", Role.FLEET)
        client.post(f"/api/maintenance/vehicles/{test_vehicle.id}",
                    headers=_headers(client, "fleet_odo"), json={
                        "service_type": "routine_service",
                        "performed_at": datetime.now(timezone.utc).isoformat(),
                        "description": "service", "odometer": 45000,
                    })
        db.refresh(test_vehicle)
        assert test_vehicle.current_mileage == 45000

    def test_negative_cost_rejected(self, client: TestClient, db: Session, test_vehicle):  # noqa: F811
        _user(db, "fleet_neg", Role.FLEET)
        r = client.post(f"/api/maintenance/vehicles/{test_vehicle.id}",
                        headers=_headers(client, "fleet_neg"), json={
                            "service_type": "repair",
                            "performed_at": datetime.now(timezone.utc).isoformat(),
                            "description": "x", "cost": "-5.00",
                        })
        assert r.status_code == 422


class TestServiceDue:
    def test_due_by_date(self, db: Session, test_vehicle):  # noqa: F811
        maintenance_service.create_record(
            db=db, vehicle_id=test_vehicle.id, service_type=MaintenanceType.OIL_CHANGE,
            performed_at=datetime.now(timezone.utc) - timedelta(days=200),
            description="old service",
            next_due_date=datetime.now(timezone.utc) - timedelta(days=1),
        )
        due = maintenance_service.get_due_vehicles(db)
        assert len(due) == 1
        assert "date" in due[0]["due_reason"]

    def test_due_by_mileage(self, db: Session, test_vehicle):  # noqa: F811
        test_vehicle.current_mileage = 20000
        db.commit()
        maintenance_service.create_record(
            db=db, vehicle_id=test_vehicle.id, service_type=MaintenanceType.ROUTINE_SERVICE,
            performed_at=datetime.now(timezone.utc) - timedelta(days=10),
            description="service", next_due_mileage=15000,
        )
        due = maintenance_service.get_due_vehicles(db)
        assert len(due) == 1
        assert "mileage" in due[0]["due_reason"]

    def test_not_due_when_future(self, db: Session, test_vehicle):  # noqa: F811
        maintenance_service.create_record(
            db=db, vehicle_id=test_vehicle.id, service_type=MaintenanceType.OIL_CHANGE,
            performed_at=datetime.now(timezone.utc), description="fresh",
            next_due_date=datetime.now(timezone.utc) + timedelta(days=90),
            next_due_mileage=999_999,
        )
        assert maintenance_service.get_due_vehicles(db) == []

    def test_newer_service_supersedes_older(self, db: Session, test_vehicle):  # noqa: F811
        """Performing the service again clears the earlier next-due."""
        maintenance_service.create_record(
            db=db, vehicle_id=test_vehicle.id, service_type=MaintenanceType.OIL_CHANGE,
            performed_at=datetime.now(timezone.utc) - timedelta(days=200),
            description="old", next_due_date=datetime.now(timezone.utc) - timedelta(days=1),
        )
        assert len(maintenance_service.get_due_vehicles(db)) == 1

        maintenance_service.create_record(
            db=db, vehicle_id=test_vehicle.id, service_type=MaintenanceType.OIL_CHANGE,
            performed_at=datetime.now(timezone.utc), description="new",
            next_due_date=datetime.now(timezone.utc) + timedelta(days=180),
        )
        assert maintenance_service.get_due_vehicles(db) == []


class TestMaintenancePermissions:
    def test_inspector_cannot_record(self, client: TestClient, db: Session, test_vehicle):  # noqa: F811
        """INSPECTOR lacks MANAGE_VEHICLES."""
        _user(db, "insp_m", Role.INSPECTOR)
        r = client.post(f"/api/maintenance/vehicles/{test_vehicle.id}",
                        headers=_headers(client, "insp_m"), json={
                            "service_type": "repair",
                            "performed_at": datetime.now(timezone.utc).isoformat(),
                            "description": "x",
                        })
        assert r.status_code == 403

    def test_inspector_can_read(self, client: TestClient, db: Session, test_vehicle):  # noqa: F811
        _user(db, "insp_r", Role.INSPECTOR)
        r = client.get(f"/api/maintenance/vehicles/{test_vehicle.id}",
                       headers=_headers(client, "insp_r"))
        assert r.status_code == 200
