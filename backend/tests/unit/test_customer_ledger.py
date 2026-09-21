"""Unit tests for customer cross-agreement ledger.

Covers:
- get_customer_ledger returns all entries across multiple agreements
- entries include the correct agreement_number for each row
- entries are ordered oldest-first
- customer with no agreements returns empty list
- entries for other customers are NOT returned
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_customer(db: Session, name: str = "Tigist", phone: str = "0911000001") -> Customer:
    c = Customer(
        first_name=name,
        last_name="Test",
        phone_primary=phone,
        business_type="individual",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_agreement(
    db: Session,
    customer: Customer,
    number: str,
    status: AgreementStatus = AgreementStatus.ACTIVE,
) -> Agreement:
    agr = Agreement(
        agreement_number=number,
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=status,
        customer_id=customer.id,
        pickup_datetime=_now(),
        expected_return_datetime=_now() + timedelta(days=3),
        agreed_daily_rate=Decimal("1500.00"),
        deposit_amount=Decimal("0"),
    )
    db.add(agr)
    db.commit()
    db.refresh(agr)
    return agr


def _post_entry(
    db: Session,
    agreement_id: int,
    amount: Decimal,
    entry_type: LedgerEntryType = LedgerEntryType.CHARGE,
    description: str = "Test entry",
) -> LedgerEntry:
    e = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=entry_type,
        amount=amount,
        description=description,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGetCustomerLedger:
    async def test_no_agreements_returns_empty(self, db: Session):
        """Customer with no agreements returns an empty list."""
        customer = _make_customer(db, phone="0911100001")
        from src.api.routers.customers import get_customer_ledger

        result = await get_customer_ledger(customer_id=customer.id, db=db, current_user=None)
        assert result == []

    async def test_single_agreement_single_entry(self, db: Session):
        """Returns one entry when a customer has one agreement with one ledger entry."""
        customer = _make_customer(db, phone="0911100002")
        agr = _make_agreement(db, customer, "AGR-TEST-001")
        _post_entry(db, agr.id, Decimal("3000.00"))

        from src.api.routers.customers import get_customer_ledger
        result = await get_customer_ledger(customer_id=customer.id, db=db, current_user=None)
        assert len(result) == 1
        assert result[0].agreement_number == "AGR-TEST-001"
        assert float(result[0].amount) == 3000.0

    async def test_multiple_agreements_all_entries_returned(self, db: Session):
        """All entries across all agreements for the customer are returned."""
        customer = _make_customer(db, phone="0911100003")
        agr1 = _make_agreement(db, customer, "AGR-MULTI-001")
        agr2 = _make_agreement(db, customer, "AGR-MULTI-002")

        _post_entry(db, agr1.id, Decimal("1500.00"), description="Charge 1")
        _post_entry(db, agr1.id, Decimal("-1500.00"), LedgerEntryType.PAYMENT, "Payment 1")
        _post_entry(db, agr2.id, Decimal("4500.00"), description="Charge 2")

        from src.api.routers.customers import get_customer_ledger
        result = await get_customer_ledger(customer_id=customer.id, db=db, current_user=None)
        assert len(result) == 3

    async def test_entries_tagged_with_correct_agreement_number(self, db: Session):
        """Each entry is tagged with its parent agreement_number."""
        customer = _make_customer(db, phone="0911100004")
        agr1 = _make_agreement(db, customer, "AGR-TAG-001")
        agr2 = _make_agreement(db, customer, "AGR-TAG-002")
        _post_entry(db, agr1.id, Decimal("1000.00"))
        _post_entry(db, agr2.id, Decimal("2000.00"))

        from src.api.routers.customers import get_customer_ledger
        result = await get_customer_ledger(customer_id=customer.id, db=db, current_user=None)
        numbers = {r.agreement_number for r in result}
        assert numbers == {"AGR-TAG-001", "AGR-TAG-002"}

    async def test_other_customer_entries_not_included(self, db: Session):
        """Entries belonging to a different customer are NOT returned."""
        customer_a = _make_customer(db, name="CustomerA", phone="0911100005")
        customer_b = _make_customer(db, name="CustomerB", phone="0911100006")

        agr_a = _make_agreement(db, customer_a, "AGR-CUSTAB-001")
        agr_b = _make_agreement(db, customer_b, "AGR-CUSTAB-002")
        _post_entry(db, agr_a.id, Decimal("1000.00"))
        _post_entry(db, agr_b.id, Decimal("9000.00"))

        from src.api.routers.customers import get_customer_ledger
        result = await get_customer_ledger(customer_id=customer_a.id, db=db, current_user=None)
        assert len(result) == 1
        assert result[0].agreement_number == "AGR-CUSTAB-001"

    async def test_entries_ordered_oldest_first(self, db: Session):
        """Entries are returned in ascending created_at order."""
        customer = _make_customer(db, phone="0911100007")
        agr = _make_agreement(db, customer, "AGR-ORDER-001")

        _post_entry(db, agr.id, Decimal("500.00"), description="First")
        _post_entry(db, agr.id, Decimal("1000.00"), description="Second")
        _post_entry(db, agr.id, Decimal("1500.00"), description="Third")

        from src.api.routers.customers import get_customer_ledger
        result = await get_customer_ledger(customer_id=customer.id, db=db, current_user=None)
        ids = [r.id for r in result]
        assert ids == sorted(ids)

    async def test_entry_type_serialized_as_string(self, db: Session):
        """entry_type comes back as a plain string value, not an enum object."""
        customer = _make_customer(db, phone="0911100008")
        agr = _make_agreement(db, customer, "AGR-STR-001")
        _post_entry(db, agr.id, Decimal("2000.00"), LedgerEntryType.PAYMENT, "Payment")

        from src.api.routers.customers import get_customer_ledger
        result = await get_customer_ledger(customer_id=customer.id, db=db, current_user=None)
        assert isinstance(result[0].entry_type, str)
        assert result[0].entry_type == "payment"

    async def test_404_for_nonexistent_customer(self, db: Session):
        """Querying a non-existent customer raises HTTP 404."""
        from fastapi import HTTPException
        from src.api.routers.customers import get_customer_ledger

        with pytest.raises(HTTPException) as exc_info:
            await get_customer_ledger(customer_id=99999, db=db, current_user=None)
        assert exc_info.value.status_code == 404
