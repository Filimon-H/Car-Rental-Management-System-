"""Every source of an agreement's balance must report the same figures.

/ledger/{id}/balance recomputed balance_due inline and left adjustments out,
so a discount moved the number on /agreements/{id} but not on the ledger
endpoint, and the ledger tab (which sums client-side) disagreed with both.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.ledger_entry import PaymentMethod
from src.services import agreement_service, ledger_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


@pytest.fixture
def agreement_20(db: Session, test_customer, test_vehicle):
    """Reproduces QA's agreement 20 exactly."""
    pickup = datetime.now(timezone.utc) + timedelta(days=3)
    ag = agreement_service.create_standard_agreement(
        db=db,
        customer_id=test_customer.id,
        vehicle_id=test_vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=9),
        daily_rate=Decimal("1500.00"),
        deposit_amount=Decimal("5000.00"),
    )
    # Charge posted on create is 13,500 for the tiered 10-day window in QA's
    # case; normalise by asserting against whatever was actually charged.
    ledger_service.post_deposit(
        db, ag.id, amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH
    )
    ledger_service.post_payment(
        db, ag.id, amount=Decimal("3000.00"), payment_method=PaymentMethod.CASH
    )
    ledger_service.post_adjustment(db, ag.id, amount=Decimal("-500.00"), description="QA discount")
    ledger_service.post_adjustment(db, ag.id, amount=Decimal("200.00"), description="QA extra")
    return ag


def test_adjustments_reach_total_charges(client, db: Session, agreement_20, auth_headers):
    rental = ledger_service.get_total_charges(db, agreement_20.id)

    balance = client.get(f"/api/ledger/{agreement_20.id}/balance", headers=auth_headers).json()

    # -500 + 200 = -300 net
    assert Decimal(str(balance["total_charges"])) == rental - Decimal("300.00")


def test_balance_due_accounts_for_adjustments(client, db: Session, agreement_20, auth_headers):
    rental = ledger_service.get_total_charges(db, agreement_20.id)
    expected = rental - Decimal("300.00") - Decimal("3000.00")

    balance = client.get(f"/api/ledger/{agreement_20.id}/balance", headers=auth_headers).json()
    assert Decimal(str(balance["balance_due"])) == expected


def test_the_two_endpoints_agree(client, agreement_20, auth_headers):
    ledger = client.get(f"/api/ledger/{agreement_20.id}/balance", headers=auth_headers).json()
    detail = client.get(f"/api/agreements/{agreement_20.id}", headers=auth_headers).json()

    for field in ("total_charges", "total_payments", "balance_due", "deposit_held"):
        assert Decimal(str(ledger[field])) == Decimal(str(detail[field])), field


def test_a_discount_lowers_both_sources(client, db: Session, agreement_20, auth_headers):
    before = client.get(f"/api/ledger/{agreement_20.id}/balance", headers=auth_headers).json()

    ledger_service.post_adjustment(
        db, agreement_20.id, amount=Decimal("-1000.00"), description="Another discount"
    )

    after = client.get(f"/api/ledger/{agreement_20.id}/balance", headers=auth_headers).json()
    detail = client.get(f"/api/agreements/{agreement_20.id}", headers=auth_headers).json()

    dropped = Decimal(str(before["balance_due"])) - Decimal(str(after["balance_due"]))
    assert dropped == Decimal("1000.00")
    assert Decimal(str(after["balance_due"])) == Decimal(str(detail["balance_due"]))


def test_deposit_is_not_counted_as_payment(client, agreement_20, auth_headers):
    balance = client.get(f"/api/ledger/{agreement_20.id}/balance", headers=auth_headers).json()
    assert Decimal(str(balance["total_payments"])) == Decimal("3000.00")
    assert Decimal(str(balance["deposit_held"])) == Decimal("5000.00")
