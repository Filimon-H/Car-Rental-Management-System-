"""Unit tests for the financial summary endpoint.

Covers:
- GET /api/ledger/summary/periods?granularity=monthly
- GET /api/ledger/summary/periods?granularity=daily
- GET /api/ledger/summary/periods?granularity=yearly
- Charges group into correct period buckets
- Payments and deposits are summed separately from charges
- Vendor payments appear in vendor_paid column
- net_revenue = total_payments - vendor_paid
- Periods with only vendor payments still appear
- Empty DB returns empty list
- All amounts come back as floats (not strings)
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.models.vendor import Vendor
from src.models.vendor_payment import VendorPayment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dt(year: int, month: int, day: int) -> datetime:
    return datetime(year, month, day, 12, 0, 0, tzinfo=timezone.utc)


def _make_customer(db: Session, phone: str = "0911200001") -> Customer:
    c = Customer(
        first_name="Summary",
        last_name="Test",
        phone_primary=phone,
        business_type="individual",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_agreement(db: Session, customer: Customer, number: str) -> Agreement:
    agr = Agreement(
        agreement_number=number,
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=AgreementStatus.ACTIVE,
        customer_id=customer.id,
        pickup_datetime=datetime.now(timezone.utc),
        expected_return_datetime=datetime.now(timezone.utc) + timedelta(days=3),
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
    entry_type: LedgerEntryType,
    created_at: datetime,
    description: str = "Test",
) -> LedgerEntry:
    e = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=entry_type,
        amount=amount,
        description=description,
    )
    db.add(e)
    db.flush()
    # Override created_at so we can control which period it falls into
    db.execute(
        text("UPDATE ledger_entries SET created_at = :ts WHERE id = :id"),
        {"ts": created_at.isoformat(), "id": e.id},
    )
    db.commit()
    db.refresh(e)
    return e


def _post_vendor_payment(
    db: Session,
    vendor: Vendor,
    amount: Decimal,
    created_at: datetime,
) -> VendorPayment:
    vp = VendorPayment(
        vendor_id=vendor.id,
        amount=amount,
        payment_method=PaymentMethod.CASH,
    )
    db.add(vp)
    db.flush()
    db.execute(
        text("UPDATE vendor_payments SET created_at = :ts WHERE id = :id"),
        {"ts": created_at.isoformat(), "id": vp.id},
    )
    db.commit()
    db.refresh(vp)
    return vp


async def _run_summary(db: Session, granularity: str = "monthly"):
    from src.api.routers.ledger import get_ledger_summary
    return await get_ledger_summary(granularity=granularity, current_user=None, db=db)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestLedgerSummaryEmpty:
    async def test_empty_db_returns_empty_list(self, db: Session):
        result = await _run_summary(db)
        assert result == []


class TestLedgerSummaryMonthly:
    async def test_single_charge_appears_in_correct_month(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200010")
        agr = _make_agreement(db, customer, "AGR-SUM-001")
        _post_entry(db, agr.id, Decimal("3000.00"), LedgerEntryType.CHARGE, _dt(2025, 3, 15))

        result = await _run_summary(db, "monthly")
        assert len(result) == 1
        assert result[0].period == "2025-03"
        assert result[0].total_charged == pytest.approx(3000.0)

    async def test_charges_across_two_months_create_two_rows(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200011")
        agr = _make_agreement(db, customer, "AGR-SUM-002")
        _post_entry(db, agr.id, Decimal("1000.00"), LedgerEntryType.CHARGE, _dt(2025, 1, 10))
        _post_entry(db, agr.id, Decimal("2000.00"), LedgerEntryType.CHARGE, _dt(2025, 2, 20))

        result = await _run_summary(db, "monthly")
        assert len(result) == 2
        periods = {r.period for r in result}
        assert periods == {"2025-01", "2025-02"}

    async def test_multiple_charges_same_month_summed(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200012")
        agr = _make_agreement(db, customer, "AGR-SUM-003")
        _post_entry(db, agr.id, Decimal("1000.00"), LedgerEntryType.CHARGE, _dt(2025, 6, 1))
        _post_entry(db, agr.id, Decimal("1500.00"), LedgerEntryType.CHARGE, _dt(2025, 6, 15))
        _post_entry(db, agr.id, Decimal("500.00"), LedgerEntryType.DAMAGE_CHARGE, _dt(2025, 6, 20))

        result = await _run_summary(db, "monthly")
        assert len(result) == 1
        assert result[0].total_charged == pytest.approx(3000.0)

    async def test_payments_separated_from_charges(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200013")
        agr = _make_agreement(db, customer, "AGR-SUM-004")
        _post_entry(db, agr.id, Decimal("3000.00"), LedgerEntryType.CHARGE, _dt(2025, 4, 1))
        _post_entry(db, agr.id, Decimal("-2000.00"), LedgerEntryType.PAYMENT, _dt(2025, 4, 5))

        result = await _run_summary(db, "monthly")
        assert len(result) == 1
        row = result[0]
        assert row.total_charged == pytest.approx(3000.0)
        assert row.total_payments == pytest.approx(2000.0)

    async def test_deposits_counted_separately(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200014")
        agr = _make_agreement(db, customer, "AGR-SUM-005")
        _post_entry(db, agr.id, Decimal("3000.00"), LedgerEntryType.CHARGE, _dt(2025, 5, 1))
        _post_entry(db, agr.id, Decimal("-1000.00"), LedgerEntryType.DEPOSIT, _dt(2025, 5, 2))

        result = await _run_summary(db, "monthly")
        row = result[0]
        assert row.total_deposits == pytest.approx(1000.0)

    async def test_vendor_paid_comes_from_vendor_payments_table(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200015")
        agr = _make_agreement(db, customer, "AGR-SUM-006")
        _post_entry(db, agr.id, Decimal("5000.00"), LedgerEntryType.CHARGE, _dt(2025, 7, 1))
        _post_vendor_payment(db, vendor, Decimal("3500.00"), _dt(2025, 7, 10))

        result = await _run_summary(db, "monthly")
        row = next(r for r in result if r.period == "2025-07")
        assert row.vendor_paid == pytest.approx(3500.0)

    async def test_net_revenue_is_payments_minus_vendor_paid(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200016")
        agr = _make_agreement(db, customer, "AGR-SUM-007")
        _post_entry(db, agr.id, Decimal("5000.00"), LedgerEntryType.CHARGE, _dt(2025, 8, 1))
        _post_entry(db, agr.id, Decimal("-5000.00"), LedgerEntryType.PAYMENT, _dt(2025, 8, 5))
        _post_vendor_payment(db, vendor, Decimal("3500.00"), _dt(2025, 8, 10))

        result = await _run_summary(db, "monthly")
        row = next(r for r in result if r.period == "2025-08")
        # net = 5000 (collected) - 3500 (vendor) = 1500
        assert row.net_revenue == pytest.approx(1500.0)

    async def test_vendor_only_period_still_appears(self, db: Session, vendor: Vendor):
        """A month with only vendor payments (no customer charges) still shows up."""
        _post_vendor_payment(db, vendor, Decimal("2000.00"), _dt(2025, 9, 1))

        result = await _run_summary(db, "monthly")
        periods = {r.period for r in result}
        assert "2025-09" in periods
        row = next(r for r in result if r.period == "2025-09")
        assert row.vendor_paid == pytest.approx(2000.0)
        assert row.net_revenue == pytest.approx(-2000.0)

    async def test_results_ordered_by_period_ascending(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200017")
        agr = _make_agreement(db, customer, "AGR-SUM-008")
        _post_entry(db, agr.id, Decimal("1000.00"), LedgerEntryType.CHARGE, _dt(2025, 12, 1))
        _post_entry(db, agr.id, Decimal("2000.00"), LedgerEntryType.CHARGE, _dt(2025, 3, 1))
        _post_entry(db, agr.id, Decimal("1500.00"), LedgerEntryType.CHARGE, _dt(2025, 6, 1))

        result = await _run_summary(db, "monthly")
        periods = [r.period for r in result]
        assert periods == sorted(periods)

    async def test_all_amounts_are_floats(self, db: Session, vendor: Vendor):
        """Response amounts must be float, not Decimal or str (frontend relies on this)."""
        customer = _make_customer(db, "0911200018")
        agr = _make_agreement(db, customer, "AGR-SUM-009")
        _post_entry(db, agr.id, Decimal("1000.00"), LedgerEntryType.CHARGE, _dt(2025, 10, 1))

        result = await _run_summary(db, "monthly")
        row = result[0]
        assert isinstance(row.total_charged, float)
        assert isinstance(row.total_payments, float)
        assert isinstance(row.vendor_paid, float)
        assert isinstance(row.net_revenue, float)


class TestLedgerSummaryGranularity:
    async def test_daily_granularity_groups_by_day(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200020")
        agr = _make_agreement(db, customer, "AGR-SUM-DAY-001")
        _post_entry(db, agr.id, Decimal("1000.00"), LedgerEntryType.CHARGE, _dt(2025, 5, 1))
        _post_entry(db, agr.id, Decimal("2000.00"), LedgerEntryType.CHARGE, _dt(2025, 5, 2))

        result = await _run_summary(db, "daily")
        assert len(result) == 2
        periods = {r.period for r in result}
        assert "2025-05-01" in periods
        assert "2025-05-02" in periods

    async def test_yearly_granularity_groups_by_year(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200021")
        agr = _make_agreement(db, customer, "AGR-SUM-YR-001")
        _post_entry(db, agr.id, Decimal("1000.00"), LedgerEntryType.CHARGE, _dt(2024, 3, 1))
        _post_entry(db, agr.id, Decimal("2000.00"), LedgerEntryType.CHARGE, _dt(2024, 11, 1))
        _post_entry(db, agr.id, Decimal("3000.00"), LedgerEntryType.CHARGE, _dt(2025, 1, 1))

        result = await _run_summary(db, "yearly")
        assert len(result) == 2
        year_map = {r.period: r.total_charged for r in result}
        assert year_map["2024"] == pytest.approx(3000.0)
        assert year_map["2025"] == pytest.approx(3000.0)

    async def test_same_day_two_entries_summed_in_daily(self, db: Session, vendor: Vendor):
        customer = _make_customer(db, "0911200022")
        agr = _make_agreement(db, customer, "AGR-SUM-DAY-002")
        _post_entry(db, agr.id, Decimal("500.00"), LedgerEntryType.CHARGE, _dt(2025, 7, 4))
        _post_entry(db, agr.id, Decimal("700.00"), LedgerEntryType.CHARGE, _dt(2025, 7, 4))

        result = await _run_summary(db, "daily")
        assert len(result) == 1
        assert result[0].total_charged == pytest.approx(1200.0)


class TestSummaryExcludesReversedEntries:
    """Reversed entries must not inflate reported revenue.

    The ledger is append-only, so a reversal adds an offsetting row rather than
    removing the original. Summing every positive amount counted both the
    mistaken charge and, separately, refunds — which are not income at all.
    """

    async def test_reversed_charge_is_not_reported_as_revenue(
        self, db: Session, vendor: Vendor
    ):
        customer = _make_customer(db, "0911200050")
        agr = _make_agreement(db, customer, "AGR-REV-001")
        charge = _post_entry(
            db, agr.id, Decimal("5000.00"), LedgerEntryType.CHARGE, _dt(2026, 3, 10)
        )
        reversal = _post_entry(
            db, agr.id, Decimal("-5000.00"), LedgerEntryType.REVERSAL, _dt(2026, 3, 10)
        )
        # Link them the way reverse_entry() does.
        reversal.reversed_entry_id = charge.id
        db.commit()

        result = await _run_summary(db, "monthly")

        # Both rows are excluded, so the period reports nothing rather than
        # 5000 of phantom revenue.
        march = next((r for r in result if r.period == "2026-03"), None)
        assert march is None or march.total_charged == 0

    async def test_refunds_are_not_counted_as_revenue(self, db: Session, vendor: Vendor):
        """DEPOSIT_RETURN is a positive amount, but it is money going out."""
        customer = _make_customer(db, "0911200051")
        agr = _make_agreement(db, customer, "AGR-REV-002")
        _post_entry(db, agr.id, Decimal("-3000.00"), LedgerEntryType.DEPOSIT, _dt(2026, 4, 12))
        _post_entry(
            db, agr.id, Decimal("3000.00"), LedgerEntryType.DEPOSIT_RETURN, _dt(2026, 4, 12)
        )

        result = await _run_summary(db, "monthly")
        april = next(r for r in result if r.period == "2026-04")

        assert april.total_charged == 0
        assert april.total_deposits == 3000

    async def test_real_charges_still_counted(self, db: Session, vendor: Vendor):
        """Control: the exclusions must not swallow genuine revenue."""
        customer = _make_customer(db, "0911200052")
        agr = _make_agreement(db, customer, "AGR-REV-003")
        _post_entry(db, agr.id, Decimal("4000.00"), LedgerEntryType.CHARGE, _dt(2026, 7, 1))
        _post_entry(db, agr.id, Decimal("500.00"), LedgerEntryType.LATE_FEE, _dt(2026, 7, 1))

        result = await _run_summary(db, "monthly")
        july = next(r for r in result if r.period == "2026-07")

        assert july.total_charged == 4500


class TestPeriodKeyIsPortable:
    """The previous query used SQLite-only strftime() against a PostgreSQL target."""

    def test_emits_dialect_appropriate_sql(self):
        from sqlalchemy.dialects import postgresql, sqlite

        from src.api.routers.ledger import _period_expression

        expression = _period_expression(LedgerEntry.created_at, "monthly")

        assert "strftime" in str(expression.compile(dialect=sqlite.dialect()))
        assert "to_char" in str(expression.compile(dialect=postgresql.dialect()))

    def test_both_dialects_use_matching_format_widths(self):
        from sqlalchemy.dialects import postgresql, sqlite

        from src.api.routers.ledger import _period_expression

        for granularity, sqlite_fmt, pg_fmt in (
            ("daily", "%Y-%m-%d", "YYYY-MM-DD"),
            ("monthly", "%Y-%m", "YYYY-MM"),
            ("yearly", "%Y", "YYYY"),
        ):
            expression = _period_expression(LedgerEntry.created_at, granularity)
            assert sqlite_fmt in str(expression.compile(dialect=sqlite.dialect()))
            assert pg_fmt in str(expression.compile(dialect=postgresql.dialect()))
