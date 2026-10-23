"""End-to-end check that audit rows are written for money and lifecycle actions."""
from datetime import datetime, timedelta, timezone

from tests.conftest import backdate_agreement
from decimal import Decimal

from src.models.audit_event import AuditEvent, AuditAction

# Reuse the agreement fixtures rather than redefining vehicle/customer shapes.
from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


def test_audit_trail_records_financial_and_lifecycle(client, db, test_vehicle, test_customer, auth_headers):
    s = datetime.now(timezone.utc) + timedelta(days=1)
    e = s + timedelta(days=2)
    r = client.post("/api/agreements", headers=auth_headers, json={
        "customer_id": test_customer.id, "vehicle_id": test_vehicle.id,
        "pickup_datetime": s.isoformat(), "expected_return_datetime": e.isoformat(),
        "daily_rate": "1000.00", "deposit_amount": "0",
    })
    assert r.status_code == 201, r.text
    aid = r.json()["id"]

    assert client.post(f"/api/ledger/{aid}/payments", headers=auth_headers,
                       json={"amount": "500.00", "payment_method": "cash", "description": "pay"}).status_code == 201
    assert client.post(f"/api/ledger/{aid}/adjustments", headers=auth_headers,
                       json={"amount": "-100.00", "description": "discount"}).status_code == 201
    assert client.post(f"/api/agreements/{aid}/activate", headers=auth_headers).status_code == 200

    # Close records a return that has happened, so the rental must lie in the
    # past by the time it is closed.
    from src.models.agreement import Agreement
    closed_at = datetime.now(timezone.utc)
    backdate_agreement(db, db.get(Agreement, aid), closed_at - timedelta(days=2), closed_at)

    assert client.post(f"/api/agreements/{aid}/close", headers=auth_headers,
                       json={"actual_return_datetime": closed_at.isoformat(), "return_mileage": 100}).status_code == 200

    rows = db.query(AuditEvent).filter(AuditEvent.entity_type == "agreement").all()
    actions = [r.action for r in rows]

    assert AuditAction.PAYMENT_POSTED in actions
    assert AuditAction.ADJUSTMENT_POSTED in actions
    assert AuditAction.AGREEMENT_CLOSED in actions
    assert all(r.actor_id is not None for r in rows), "every audit row must have an actor"
