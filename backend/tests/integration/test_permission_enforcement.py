"""Endpoints must enforce the permissions the RBAC matrix declares.

These existed in ROLE_PERMISSIONS but were checked by no router, so the matrix
described access rules the API did not actually apply.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.staff_user import StaffUser


def _user(db: Session, username: str, role: Role) -> StaffUser:
    u = StaffUser(
        username=username,
        email=f"{username}@example.com",
        full_name=username,
        hashed_password=hash_password("testpass123"),
        role=role,
        is_active=True,
    )
    db.add(u)
    db.commit()
    return u


def _headers(client: TestClient, username: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestDashboardPermission:
    def test_inspector_denied_dashboard(self, client: TestClient, db: Session):
        """INSPECTOR lacks VIEW_DASHBOARD, so must not see company revenue."""
        _user(db, "insp_dash", Role.INSPECTOR)
        r = client.get("/api/dashboard", headers=_headers(client, "insp_dash"))
        assert r.status_code == 403

    @pytest.mark.parametrize("role,username", [
        (Role.ADMIN, "admin_dash"),
        (Role.SALES, "sales_dash"),
        (Role.FLEET, "fleet_dash"),
        (Role.ACCOUNTANT, "acct_dash"),
    ])
    def test_roles_with_permission_allowed(self, client: TestClient, db: Session, role, username):
        _user(db, username, role)
        r = client.get("/api/dashboard", headers=_headers(client, username))
        assert r.status_code == 200


class TestPrintDocumentsPermission:
    def test_fleet_denied_document_generation(self, client: TestClient, db: Session):
        """FLEET can view agreements but lacks PRINT_DOCUMENTS."""
        _user(db, "fleet_doc", Role.FLEET)
        r = client.post("/api/documents/agreements/1/generate", headers=_headers(client, "fleet_doc"))
        assert r.status_code == 403

    def test_inspector_allowed_document_generation(self, client: TestClient, db: Session):
        """INSPECTOR holds PRINT_DOCUMENTS; 403 must not be the reason it fails."""
        _user(db, "insp_doc", Role.INSPECTOR)
        r = client.post("/api/documents/agreements/999/generate", headers=_headers(client, "insp_doc"))
        assert r.status_code != 403


class TestManageBookingsPermission:
    def test_fleet_denied_booking_approval(self, client: TestClient, db: Session):
        """Approving a customer booking requires MANAGE_BOOKINGS."""
        _user(db, "fleet_book", Role.FLEET)
        r = client.post("/api/agreements/1/approve-request", headers=_headers(client, "fleet_book"))
        assert r.status_code == 403

    def test_sales_allowed_booking_approval(self, client: TestClient, db: Session):
        _user(db, "sales_book", Role.SALES)
        r = client.post("/api/agreements/999/approve-request", headers=_headers(client, "sales_book"))
        assert r.status_code != 403
