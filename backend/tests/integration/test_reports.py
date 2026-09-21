"""Reporting exports must reconcile with the ledger and respect VIEW_REPORTS."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from tests.conftest import backdate_agreement
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.ledger_entry import PaymentMethod
from src.models.staff_user import StaffUser
from src.services import agreement_service, ledger_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    test_customer,
    test_vehicle,
)


def _user(db: Session, username: str, role: Role) -> StaffUser:
    u = StaffUser(username=username, email=f"{username}@e.com", full_name=username,
                  hashed_password=hash_password("testpass123"), role=role, is_active=True)
    db.add(u); db.commit()
    return u


def _headers(client: TestClient, username: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def agreement_with_money(db: Session, test_customer, test_vehicle):  # noqa: F811
    pickup = datetime.now(timezone.utc) - timedelta(days=2)
    lead = datetime.now(timezone.utc) + timedelta(days=1)
    ag = agreement_service.create_standard_agreement(
        db=db, customer_id=test_customer.id, vehicle_id=test_vehicle.id,
        pickup_datetime=lead, expected_return_datetime=lead + timedelta(days=3),
        daily_rate=Decimal("1000.00"),
    )
    backdate_agreement(db, ag, pickup)
    ledger_service.post_payment(db=db, agreement_id=ag.id, amount=Decimal("1200.00"),
                                payment_method=PaymentMethod.CASH)
    return ag


class TestReportPermissions:
    def test_sales_denied_revenue_report(self, client: TestClient, db: Session):
        """SALES lacks VIEW_REPORTS."""
        _user(db, "sales_rep", Role.SALES)
        r = client.get("/api/reports/revenue", headers=_headers(client, "sales_rep"))
        assert r.status_code == 403

    def test_accountant_allowed_revenue_report(self, client: TestClient, db: Session):
        _user(db, "acct_rep", Role.ACCOUNTANT)
        r = client.get("/api/reports/revenue", headers=_headers(client, "acct_rep"))
        assert r.status_code == 200

    def test_unauthenticated_denied(self, client: TestClient):
        assert client.get("/api/reports/revenue").status_code in (401, 403)


class TestRevenueReport:
    def test_revenue_matches_ledger(self, client: TestClient, db: Session, agreement_with_money):
        """Reported charges must equal what the ledger holds for the period."""
        _user(db, "acct_rev", Role.ACCOUNTANT)
        r = client.get("/api/reports/revenue", headers=_headers(client, "acct_rev"))
        assert r.status_code == 200
        body = r.json()
        # 3 days @ 1000 charged on create, 1200 collected
        assert Decimal(body["gross_charges"]) == Decimal("3000.00")
        assert Decimal(body["payments_collected"]) == Decimal("1200.00")

    def test_rejects_inverted_range(self, client: TestClient, db: Session):
        _user(db, "acct_bad", Role.ACCOUNTANT)
        now = datetime.now(timezone.utc)
        r = client.get(
            "/api/reports/revenue",
            params={"start": now.isoformat(), "end": (now - timedelta(days=1)).isoformat()},
            headers=_headers(client, "acct_bad"),
        )
        assert r.status_code == 400

    def test_rejects_excessive_range(self, client: TestClient, db: Session):
        _user(db, "acct_wide", Role.ACCOUNTANT)
        now = datetime.now(timezone.utc)
        r = client.get(
            "/api/reports/revenue",
            params={"start": (now - timedelta(days=5000)).isoformat(), "end": now.isoformat()},
            headers=_headers(client, "acct_wide"),
        )
        assert r.status_code == 400


class TestCsvExports:
    def test_agreement_ledger_csv(self, client: TestClient, db: Session, agreement_with_money):
        _user(db, "acct_led", Role.ACCOUNTANT)
        r = client.get(f"/api/reports/agreements/{agreement_with_money.id}/ledger.csv",
                       headers=_headers(client, "acct_led"))
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        assert "attachment" in r.headers["content-disposition"]
        text = r.text
        assert "Running Balance" in text
        assert "3000.00" in text and "-1200.00" in text

    def test_revenue_csv(self, client: TestClient, db: Session, agreement_with_money):
        _user(db, "acct_rcsv", Role.ACCOUNTANT)
        r = client.get("/api/reports/revenue.csv", headers=_headers(client, "acct_rcsv"))
        assert r.status_code == 200
        assert "Net revenue" in r.text

    def test_vendor_payables_csv(self, client: TestClient, db: Session, agreement_with_money):
        _user(db, "acct_vcsv", Role.ACCOUNTANT)
        r = client.get("/api/reports/vendor-payables.csv", headers=_headers(client, "acct_vcsv"))
        assert r.status_code == 200
        assert "Outstanding" in r.text

    def test_fleet_utilization_csv(self, client: TestClient, db: Session, agreement_with_money):
        _user(db, "acct_fcsv", Role.ACCOUNTANT)
        r = client.get("/api/reports/fleet-utilization.csv", headers=_headers(client, "acct_fcsv"))
        assert r.status_code == 200
        assert "Utilization %" in r.text
        assert "AA-12345" in r.text
