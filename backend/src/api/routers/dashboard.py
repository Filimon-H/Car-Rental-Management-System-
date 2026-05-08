"""Dashboard stats router — single endpoint returning all counts and revenue."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from src.api.deps.auth import CurrentUser
from src.core.db import get_db
from src.models.agreement import Agreement, AgreementStatus
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntry, LedgerEntryType
from src.models.vehicle import Vehicle, VehicleStatus

router = APIRouter()


class VehicleStats(BaseModel):
    total: int
    available: int
    rented: int
    maintenance: int


class RevenueStats(BaseModel):
    collected_this_month: Decimal
    outstanding_balance: Decimal
    total_all_time: Decimal


class RecentAgreement(BaseModel):
    id: int
    agreement_number: str
    customer_name: str
    status: str
    expected_return_datetime: str | None
    created_at: str

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    active_agreements: int
    overdue_agreements: int
    pending_agreements: int
    total_agreements: int
    due_today: int
    vehicles: VehicleStats
    total_customers: int
    revenue: RevenueStats
    recent_agreements: list[RecentAgreement]


@router.get("", response_model=DashboardStats)
async def get_dashboard_stats(
    _current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> DashboardStats:
    """Return all dashboard counts and revenue in a single query batch."""

    # Agreement counts grouped by status
    status_counts: dict[str, int] = {}
    rows = db.query(Agreement.status, func.count(Agreement.id)).group_by(Agreement.status).all()
    for status, count in rows:
        status_counts[status] = count

    active = status_counts.get(AgreementStatus.ACTIVE, 0)
    overdue = status_counts.get(AgreementStatus.OVERDUE, 0)
    pending = status_counts.get(AgreementStatus.PENDING_PAYMENT, 0)
    total = sum(status_counts.values())

    # Due today — active agreements whose expected_return_datetime falls today (local day)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    due_today = (
        db.query(func.count(Agreement.id))
        .filter(
            Agreement.status == AgreementStatus.ACTIVE,
            Agreement.expected_return_datetime >= today_start,
            Agreement.expected_return_datetime <= today_end,
        )
        .scalar()
        or 0
    )

    # Vehicle counts grouped by status
    vehicle_rows = db.query(Vehicle.status, func.count(Vehicle.id)).group_by(Vehicle.status).all()
    v_counts: dict[str, int] = {s: c for s, c in vehicle_rows}
    vehicles = VehicleStats(
        total=sum(v_counts.values()),
        available=v_counts.get(VehicleStatus.AVAILABLE, 0),
        rented=v_counts.get(VehicleStatus.RENTED, 0),
        maintenance=v_counts.get(VehicleStatus.MAINTENANCE, 0),
    )

    # Customer count
    total_customers = db.query(func.count(Customer.id)).scalar() or 0

    # Revenue — payments (negative amounts) and charges (positive amounts) from ledger
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    collected_this_month = (
        db.query(func.coalesce(func.sum(func.abs(LedgerEntry.amount)), 0))
        .filter(
            LedgerEntry.entry_type == LedgerEntryType.PAYMENT,
            LedgerEntry.created_at >= month_start,
        )
        .scalar()
        or Decimal("0")
    )

    total_all_time = (
        db.query(func.coalesce(func.sum(func.abs(LedgerEntry.amount)), 0))
        .filter(LedgerEntry.entry_type == LedgerEntryType.PAYMENT)
        .scalar()
        or Decimal("0")
    )

    # Outstanding: sum of all charges minus sum of all payments across active+overdue agreements
    charge_types = [
        LedgerEntryType.CHARGE,
        LedgerEntryType.DAMAGE_CHARGE,
        LedgerEntryType.LATE_FEE,
    ]
    active_ids = (
        db.query(Agreement.id)
        .filter(Agreement.status.in_([AgreementStatus.ACTIVE, AgreementStatus.OVERDUE, AgreementStatus.RETURNED]))
        .subquery()
    )
    total_charges = (
        db.query(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .filter(LedgerEntry.agreement_id.in_(active_ids), LedgerEntry.entry_type.in_(charge_types))
        .scalar()
        or Decimal("0")
    )
    total_paid = (
        db.query(func.coalesce(func.sum(func.abs(LedgerEntry.amount)), 0))
        .filter(
            LedgerEntry.agreement_id.in_(active_ids),
            LedgerEntry.entry_type == LedgerEntryType.PAYMENT,
        )
        .scalar()
        or Decimal("0")
    )
    outstanding = max(Decimal("0"), Decimal(str(total_charges)) - Decimal(str(total_paid)))

    # Recent 5 agreements with customer joined
    recent_rows = (
        db.query(Agreement)
        .options(joinedload(Agreement.customer))
        .order_by(Agreement.created_at.desc())
        .limit(5)
        .all()
    )
    recent_agreements = [
        RecentAgreement(
            id=a.id,
            agreement_number=a.agreement_number,
            customer_name=a.customer.full_name if a.customer else "Unknown",
            status=a.status,
            expected_return_datetime=a.expected_return_datetime.isoformat() if a.expected_return_datetime else None,
            created_at=a.created_at.isoformat(),
        )
        for a in recent_rows
    ]

    return DashboardStats(
        active_agreements=active,
        overdue_agreements=overdue,
        pending_agreements=pending,
        total_agreements=total,
        due_today=due_today,
        vehicles=vehicles,
        total_customers=total_customers,
        revenue=RevenueStats(
            collected_this_month=Decimal(str(collected_this_month)),
            outstanding_balance=outstanding,
            total_all_time=Decimal(str(total_all_time)),
        ),
        recent_agreements=recent_agreements,
    )
