"""Ledger API router for direct ledger operations."""

import csv
import io
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql import expression

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.audit_event import AuditAction
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.models.vendor_payment import VendorPayment
from src.services import audit_service, ledger_service

router = APIRouter()


class _PeriodKey(expression.FunctionElement):
    """Formats a timestamp column into a period key like "2026-05".

    SQLite and PostgreSQL disagree on date formatting (strftime vs to_char) and
    on format strings, so the SQL is emitted per dialect below. Both produce the
    same keys, keeping the response identical across environments.
    """

    name = "period_key"
    # Caching must stay off: granularity lives on the Python object, not in the
    # clause list, so SQLAlchemy's cache key cannot see it. With caching enabled the
    # first granularity compiled in a process wins and every later call silently
    # reuses its format string — a "yearly" query would return monthly keys.
    inherit_cache = False

    def __init__(self, column, granularity: str):
        self.granularity = granularity
        super().__init__(column)


_SQLITE_FORMATS = {"daily": "%Y-%m-%d", "monthly": "%Y-%m", "yearly": "%Y"}
_POSTGRES_FORMATS = {"daily": "YYYY-MM-DD", "monthly": "YYYY-MM", "yearly": "YYYY"}


@compiles(_PeriodKey)
def _compile_period_key_default(element, compiler, **kw):
    """PostgreSQL and most other dialects."""
    column = list(element.clauses)[0]
    fmt = _POSTGRES_FORMATS[element.granularity]
    return f"to_char({compiler.process(column, **kw)}, '{fmt}')"


@compiles(_PeriodKey, "sqlite")
def _compile_period_key_sqlite(element, compiler, **kw):
    column = list(element.clauses)[0]
    fmt = _SQLITE_FORMATS[element.granularity]
    return f"strftime('{fmt}', {compiler.process(column, **kw)})"


def _period_expression(column, granularity: str):
    """Period key for `column`; `granularity` is already pattern-validated."""
    return _PeriodKey(column, granularity)


# Schemas
class LedgerEntryResponse(BaseModel):
    id: int
    agreement_id: int
    entry_type: LedgerEntryType
    amount: Decimal
    description: str
    payment_method: Optional[PaymentMethod] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    reversed_entry_id: Optional[int] = None
    created_at: str
    created_by_id: Optional[int] = None

    class Config:
        from_attributes = True


class PostChargeRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    description: str
    entry_type: LedgerEntryType = LedgerEntryType.CHARGE
    notes: Optional[str] = None


class PostPaymentRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    description: str = "Payment received"
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class PostAdjustmentRequest(BaseModel):
    amount: Decimal  # Can be positive or negative
    description: str
    notes: Optional[str] = None


class PostDepositRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    description: str = "Security deposit received"
    notes: Optional[str] = None


class ReverseEntryRequest(BaseModel):
    reason: str


class BalanceResponse(BaseModel):
    agreement_id: int
    balance: Decimal
    total_charges: Decimal
    total_payments: Decimal
    deposit_received: Decimal
    deposit_held: Decimal
    deposit_applied: Decimal
    deposit_returned: Decimal
    balance_due: Decimal  # max(0, charges - payments - applied_deposit)


# Endpoints
@router.get("/{agreement_id}", response_model=list[LedgerEntryResponse])
async def get_ledger_entries(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Get all ledger entries for an agreement."""
    entries = ledger_service.get_ledger_entries(db, agreement_id)
    return [LedgerEntryResponse(
        id=e.id,
        agreement_id=e.agreement_id,
        entry_type=e.entry_type,
        amount=e.amount,
        description=e.description,
        payment_method=e.payment_method,
        payment_reference=e.payment_reference,
        notes=e.notes,
        reversed_entry_id=e.reversed_entry_id,
        created_at=e.created_at.isoformat(),
        created_by_id=e.created_by_id,
    ) for e in entries]


@router.get("/{agreement_id}/balance", response_model=BalanceResponse)
async def get_balance(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Get current balance for an agreement."""
    balance = ledger_service.get_agreement_balance(db, agreement_id)
    total_charges = ledger_service.get_total_charges(db, agreement_id)
    total_payments = ledger_service.get_total_payments(db, agreement_id)
    deposit_received = ledger_service.get_deposit_received(db, agreement_id)
    deposit_held = ledger_service.get_deposit_held(db, agreement_id)
    deposit_applied = ledger_service.get_deposit_applied(db, agreement_id)
    deposit_returned = ledger_service.get_deposit_returned(db, agreement_id)
    balance_due = max(Decimal("0"), total_charges - total_payments - deposit_applied)

    return BalanceResponse(
        agreement_id=agreement_id,
        balance=balance,
        total_charges=total_charges,
        total_payments=total_payments,
        deposit_received=deposit_received,
        deposit_held=deposit_held,
        deposit_applied=deposit_applied,
        deposit_returned=deposit_returned,
        balance_due=balance_due,
    )


@router.post("/{agreement_id}/charges", response_model=LedgerEntryResponse, status_code=201)
async def post_charge(
    agreement_id: int,
    data: PostChargeRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post a charge to the ledger."""
    entry = ledger_service.post_charge(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        description=data.description,
        entry_type=data.entry_type,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    audit_service.log_financial_event(
        db=db,
        action=AuditAction.CHARGE_POSTED,
        agreement_id=agreement_id,
        amount=data.amount,
        actor_id=current_user.id,
        details={"entry_type": data.entry_type.value, "entry_id": entry.id},
    )
    return LedgerEntryResponse(
        id=entry.id,
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/{agreement_id}/payments", response_model=LedgerEntryResponse, status_code=201)
async def post_payment(
    agreement_id: int,
    data: PostPaymentRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post a payment to the ledger."""
    entry = ledger_service.post_payment(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        payment_method=data.payment_method,
        description=data.description,
        payment_reference=data.payment_reference,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    audit_service.log_financial_event(
        db=db,
        action=AuditAction.PAYMENT_POSTED,
        agreement_id=agreement_id,
        amount=data.amount,
        actor_id=current_user.id,
        details={
            "payment_method": data.payment_method.value,
            "payment_reference": data.payment_reference,
            "entry_id": entry.id,
        },
    )
    return LedgerEntryResponse(
        id=entry.id,
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/{agreement_id}/deposits", response_model=LedgerEntryResponse, status_code=201)
async def post_deposit(
    agreement_id: int,
    data: PostDepositRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post a deposit to the ledger."""
    entry = ledger_service.post_deposit(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        payment_method=data.payment_method,
        description=data.description,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    audit_service.log_financial_event(
        db=db,
        action=AuditAction.PAYMENT_POSTED,
        agreement_id=agreement_id,
        amount=data.amount,
        actor_id=current_user.id,
        details={"kind": "deposit", "payment_method": data.payment_method.value, "entry_id": entry.id},
    )
    return LedgerEntryResponse(
        id=entry.id,
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/{agreement_id}/adjustments", response_model=LedgerEntryResponse, status_code=201)
async def post_adjustment(
    agreement_id: int,
    data: PostAdjustmentRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_ADJUSTMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post an adjustment to the ledger."""
    entry = ledger_service.post_adjustment(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        description=data.description,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    audit_service.log_financial_event(
        db=db,
        action=AuditAction.ADJUSTMENT_POSTED,
        agreement_id=agreement_id,
        amount=data.amount,
        actor_id=current_user.id,
        details={"description": data.description, "entry_id": entry.id},
    )
    return LedgerEntryResponse(
        id=entry.id,
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/entries/{entry_id}/reverse", response_model=LedgerEntryResponse, status_code=201)
async def reverse_entry(
    entry_id: int,
    data: ReverseEntryRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_ADJUSTMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Reverse a ledger entry."""
    try:
        entry = ledger_service.reverse_entry(
            db=db,
            entry_id=entry_id,
            reason=data.reason,
            created_by_id=current_user.id,
        )
        audit_service.log_financial_event(
            db=db,
            action=AuditAction.ADJUSTMENT_POSTED,
            agreement_id=entry.agreement_id,
            amount=entry.amount,
            actor_id=current_user.id,
            details={"kind": "reversal", "reversed_entry_id": entry_id, "reason": data.reason},
        )
        return LedgerEntryResponse(
            id=entry.id,
            agreement_id=entry.agreement_id,
            entry_type=entry.entry_type,
            amount=entry.amount,
            description=entry.description,
            payment_method=entry.payment_method,
            payment_reference=entry.payment_reference,
            notes=entry.notes,
            reversed_entry_id=entry.reversed_entry_id,
            created_at=entry.created_at.isoformat(),
            created_by_id=entry.created_by_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Financial summary (daily / monthly / yearly)
# ---------------------------------------------------------------------------


class PeriodSummary(BaseModel):
    period: str          # e.g. "2026-05", "2026-05-09", "2026"
    total_charged: float
    total_payments: float
    total_deposits: float
    vendor_paid: float
    net_revenue: float   # total_payments - vendor_paid


@router.get("/export/csv")
async def export_ledger_csv(
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
    agreement_id: int | None = None,
    entry_type: LedgerEntryType | None = None,
    date_from: datetime | None = Query(None, description="Include entries created on or after this datetime"),
    date_to: datetime | None = Query(None, description="Include entries created on or before this datetime"),
):
    """Export ledger entries as CSV.

    Takes the same filters as the ledger views so the download matches what the
    user is looking at. The rows are streamed rather than buffered, so a large
    export doesn't hold the whole file in memory.
    """
    query = db.query(LedgerEntry).options(joinedload(LedgerEntry.agreement))

    if agreement_id:
        query = query.filter(LedgerEntry.agreement_id == agreement_id)
    if entry_type:
        query = query.filter(LedgerEntry.entry_type == entry_type)
    if date_from:
        query = query.filter(LedgerEntry.created_at >= date_from)
    if date_to:
        query = query.filter(LedgerEntry.created_at <= date_to)

    entries = query.order_by(LedgerEntry.created_at.desc()).all()

    def rows():
        buffer = io.StringIO()
        writer = csv.writer(buffer)

        def flush() -> str:
            value = buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
            return value

        writer.writerow([
            "Entry ID", "Agreement ID", "Agreement Number", "Date", "Type",
            "Amount", "Description", "Payment Method", "Payment Reference", "Notes",
        ])
        yield flush()

        for entry in entries:
            agreement = entry.agreement
            writer.writerow([
                entry.id,
                entry.agreement_id,
                agreement.agreement_number if agreement else "",
                entry.created_at.isoformat() if entry.created_at else "",
                entry.entry_type.value if entry.entry_type else "",
                f"{entry.amount:.2f}" if entry.amount is not None else "",
                entry.description or "",
                entry.payment_method.value if entry.payment_method else "",
                entry.payment_reference or "",
                entry.notes or "",
            ])
            yield flush()

    filename = f"ledger-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/summary/periods", response_model=list[PeriodSummary])
async def get_ledger_summary(
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
    granularity: str = Query("monthly", pattern="^(daily|monthly|yearly)$"),
):
    """Aggregate financial totals grouped by day, month, or year.

    Built with ORM expressions rather than raw SQL: the previous version used
    SQLite's strftime(), which does not exist on PostgreSQL, and compared
    entry_type against the enum's Python *names* rather than letting SQLAlchemy
    bind the enum.

    Reversed entries are excluded — the ledger is append-only, so a reversal adds
    an offsetting row instead of deleting the original, and counting both
    inflated revenue. Only real charge types count toward total_charged, so
    refunds (DEPOSIT_RETURN) are no longer reported as income.
    """
    period = _period_expression(LedgerEntry.created_at, granularity)
    vendor_period = _period_expression(VendorPayment.created_at, granularity)

    charge_types = [
        LedgerEntryType.CHARGE,
        LedgerEntryType.DAMAGE_CHARGE,
        LedgerEntryType.LATE_FEE,
    ]

    # Entries that were later reversed, plus the REVERSAL rows themselves.
    reversed_ids = db.query(LedgerEntry.reversed_entry_id).filter(
        LedgerEntry.reversed_entry_id.isnot(None)
    )
    standing = and_(
        LedgerEntry.entry_type != LedgerEntryType.REVERSAL,
        ~LedgerEntry.id.in_(reversed_ids),
    )

    def _sum_where(condition):
        return func.coalesce(
            func.sum(case((condition, func.abs(LedgerEntry.amount)), else_=0)), 0
        )

    ledger_rows = (
        db.query(
            period.label("period"),
            _sum_where(LedgerEntry.entry_type.in_(charge_types)).label("charged"),
            _sum_where(LedgerEntry.entry_type == LedgerEntryType.PAYMENT).label("payments"),
            _sum_where(LedgerEntry.entry_type == LedgerEntryType.DEPOSIT).label("deposits"),
        )
        .filter(standing)
        .group_by(period)
        .order_by(period)
        .all()
    )

    vendor_rows = (
        db.query(
            vendor_period.label("period"),
            func.coalesce(func.sum(VendorPayment.amount), 0).label("vendor_paid"),
        )
        .group_by(vendor_period)
        .order_by(vendor_period)
        .all()
    )

    vendor_map: dict[str, float] = {
        row.period: float(row.vendor_paid or 0) for row in vendor_rows
    }

    result: list[PeriodSummary] = []
    seen_periods: set[str] = set()

    for row in ledger_rows:
        key = row.period or "unknown"
        seen_periods.add(key)
        payments = float(row.payments or 0)
        vendor_paid = vendor_map.get(key, 0.0)
        result.append(PeriodSummary(
            period=key,
            total_charged=float(row.charged or 0),
            total_payments=payments,
            total_deposits=float(row.deposits or 0),
            vendor_paid=vendor_paid,
            net_revenue=payments - vendor_paid,
        ))

    for key, vendor_paid in vendor_map.items():
        if key not in seen_periods:
            result.append(PeriodSummary(
                period=key,
                total_charged=0.0,
                total_payments=0.0,
                total_deposits=0.0,
                vendor_paid=vendor_paid,
                net_revenue=-vendor_paid,
            ))

    result.sort(key=lambda x: x.period)
    return result
