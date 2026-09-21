"""Dashboard stats router — single endpoint returning all counts and revenue."""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntry, LedgerEntryType
from src.models.vehicle import Vehicle, VehicleStatus

router = APIRouter()


class InsuranceExpiryStats(BaseModel):
    total: int
    today: int
    within_5_days: int
    within_10_days: int
    within_month: int
    overdue: int


class PickupStats(BaseModel):
    total: int
    today: int
    tomorrow: int
    within_5_days: int
    within_10_days: int


class VehicleStats(BaseModel):
    total: int
    available: int
    rented: int
    maintenance: int
    reserved: int
    # Vehicles whose latest service record says another service is now due.
    service_due: int = 0
    insurance: InsuranceExpiryStats


class RevenueStats(BaseModel):
    collected_this_month: Decimal
    outstanding_balance: Decimal
    total_all_time: Decimal


class VendorAgreementStats(BaseModel):
    total: int
    ending_today: int
    expiring_5_days: int
    expiring_10_days: int
    overdue: int


class CustomerAgreementStats(BaseModel):
    total: int
    ending_today: int
    expiring_5_days: int
    expiring_10_days: int
    overdue: int


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
    booking_requests: int
    total_agreements: int
    due_today: int
    pickups: PickupStats
    vehicles: VehicleStats
    total_customers: int
    revenue: RevenueStats
    vendor_agreements: VendorAgreementStats
    customer_agreements: CustomerAgreementStats
    recent_agreements: list[RecentAgreement]


@router.get("", response_model=DashboardStats)
async def get_dashboard_stats(
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_DASHBOARD))],
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
    booking_requests = status_counts.get(AgreementStatus.BOOKING_REQUESTED, 0)
    total = sum(status_counts.values())

    # Due today — active agreements whose expected_return_datetime falls today (local day)
    # Use naive datetimes to match SQLite's timezone-unaware storage
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    tomorrow_end = today_end + timedelta(days=1)
    end_5_limit = today_end + timedelta(days=5)
    end_10_limit = today_end + timedelta(days=10)
    end_month_limit = today_end + timedelta(days=30)
    
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

    # Pickups (agreements with start_datetime upcoming or today)
    pickups_rows = (
        db.query(Agreement.pickup_datetime)
        .filter(Agreement.status.in_([AgreementStatus.ACTIVE, AgreementStatus.PENDING_PAYMENT, AgreementStatus.BOOKING_REQUESTED]))
        .filter(Agreement.pickup_datetime >= today_start)
        .all()
    )
    p_total = len(pickups_rows)
    p_today = 0
    p_tomorrow = 0
    p_5 = 0
    p_10 = 0
    for (start_dt,) in pickups_rows:
        if start_dt <= today_end:
            p_today += 1
        elif start_dt <= tomorrow_end:
            p_tomorrow += 1
            p_5 += 1
            p_10 += 1
        elif start_dt <= end_5_limit:
            p_5 += 1
            p_10 += 1
        elif start_dt <= end_10_limit:
            p_10 += 1

    pickups = PickupStats(
        total=p_total,
        today=p_today,
        tomorrow=p_tomorrow,
        within_5_days=p_5,
        within_10_days=p_10,
    )

    # Vehicle counts grouped by status
    vehicle_rows = db.query(Vehicle.status, func.count(Vehicle.id)).group_by(Vehicle.status).all()
    v_counts: dict[str, int] = {s: c for s, c in vehicle_rows}
    
    # Insurance expiring count
    insurance_rows = db.query(Vehicle.insurance_expiry).filter(Vehicle.insurance_expiry.isnot(None)).all()
    ins_total = 0
    ins_today = 0
    ins_5 = 0
    ins_10 = 0
    ins_month = 0
    ins_overdue = 0

    for (exp_dt,) in insurance_rows:
        if exp_dt < today_start:
            ins_overdue += 1
            ins_total += 1
        elif exp_dt <= today_end:
            ins_today += 1
            ins_total += 1
        elif exp_dt <= end_5_limit:
            ins_5 += 1
            ins_total += 1
        elif exp_dt <= end_10_limit:
            ins_10 += 1
            ins_total += 1
        elif exp_dt <= end_month_limit:
            ins_month += 1
            ins_total += 1

    # Vehicles past their next scheduled service, by date or by mileage.
    from src.services import maintenance_service

    service_due = len(maintenance_service.get_due_vehicles(db, as_of=now))

    vehicles = VehicleStats(
        total=sum(v_counts.values()),
        available=v_counts.get(VehicleStatus.AVAILABLE, 0),
        rented=v_counts.get(VehicleStatus.RENTED, 0),
        maintenance=v_counts.get(VehicleStatus.MAINTENANCE, 0),
        reserved=v_counts.get(VehicleStatus.RESERVED, 0),
        service_due=service_due,
        insurance=InsuranceExpiryStats(
            total=ins_total,
            today=ins_today,
            within_5_days=ins_5,
            within_10_days=ins_10,
            within_month=ins_month,
            overdue=ins_overdue,
        )
    )

    # Customer count
    total_customers = db.query(func.count(Customer.id)).scalar() or 0

    # Revenue — payments (negative amounts) and charges (positive amounts) from ledger
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # The ledger is append-only: reversing an entry adds an offsetting row rather
    # than removing the original. Every figure below filters by entry_type, which
    # never matches REVERSAL, so without this a reversed payment would still be
    # reported as money collected.
    reversed_entry_ids = db.query(LedgerEntry.reversed_entry_id).filter(
        LedgerEntry.reversed_entry_id.isnot(None)
    )
    not_reversed = ~LedgerEntry.id.in_(reversed_entry_ids)

    collected_this_month = (
        db.query(func.coalesce(func.sum(func.abs(LedgerEntry.amount)), 0))
        .filter(
            LedgerEntry.entry_type == LedgerEntryType.PAYMENT,
            LedgerEntry.created_at >= month_start,
            not_reversed,
        )
        .scalar()
        or Decimal("0")
    )

    total_all_time = (
        db.query(func.coalesce(func.sum(func.abs(LedgerEntry.amount)), 0))
        .filter(LedgerEntry.entry_type == LedgerEntryType.PAYMENT, not_reversed)
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
        .filter(
            LedgerEntry.agreement_id.in_(active_ids),
            LedgerEntry.entry_type.in_(charge_types),
            not_reversed,
        )
        .scalar()
        or Decimal("0")
    )
    total_paid = (
        db.query(func.coalesce(func.sum(func.abs(LedgerEntry.amount)), 0))
        .filter(
            LedgerEntry.agreement_id.in_(active_ids),
            LedgerEntry.entry_type == LedgerEntryType.PAYMENT,
            not_reversed,
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

    # Vendor agreements calculation
    _vendor_types = [AgreementType.VENDOR_VEHICLE, AgreementType.VENDOR_WEDDING]
    _customer_types = [
        AgreementType.CUSTOMER_VEHICLE,
        AgreementType.CUSTOMER_VEHICLE_DRIVER,
        AgreementType.STANDARD,
        AgreementType.WEDDING,
    ]
    vendor_agreements_rows = (
        db.query(Agreement.status, Agreement.expected_return_datetime)
        .filter(
            Agreement.agreement_type.in_(_vendor_types),
            Agreement.status.in_([AgreementStatus.ACTIVE, AgreementStatus.OVERDUE])
        )
        .all()
    )

    vendor_total = len(vendor_agreements_rows)
    v_ending_today = 0
    v_expiring_5 = 0
    v_expiring_10 = 0
    v_overdue = 0

    end_today_limit = today_end
    end_5_limit = today_end + timedelta(days=5)
    end_10_limit = today_end + timedelta(days=10)

    for status, return_dt in vendor_agreements_rows:
        if status == AgreementStatus.OVERDUE:
            v_overdue += 1
        elif status == AgreementStatus.ACTIVE and return_dt:
            if return_dt <= end_today_limit:
                v_ending_today += 1
            elif return_dt <= end_5_limit:
                v_expiring_5 += 1
            elif return_dt <= end_10_limit:
                v_expiring_10 += 1

    vendor_agreements = VendorAgreementStats(
        total=vendor_total,
        ending_today=v_ending_today,
        expiring_5_days=v_expiring_5,
        expiring_10_days=v_expiring_10,
        overdue=v_overdue,
    )

    # Customer agreements calculation
    # Use explicit in_ list + IS NULL fallback — NOT IN is NULL-unsafe in SQL
    customer_agreements_rows = (
        db.query(Agreement.status, Agreement.expected_return_datetime)
        .filter(
            or_(
                Agreement.agreement_type.in_(_customer_types),
                Agreement.agreement_type.is_(None),
            ),
            Agreement.status.in_([AgreementStatus.ACTIVE, AgreementStatus.OVERDUE])
        )
        .all()
    )

    c_total = len(customer_agreements_rows)
    c_ending_today = 0
    c_expiring_5 = 0
    c_expiring_10 = 0
    c_overdue = 0

    for status, return_dt in customer_agreements_rows:
        if status == AgreementStatus.OVERDUE:
            c_overdue += 1
        elif status == AgreementStatus.ACTIVE and return_dt:
            if return_dt <= end_today_limit:
                c_ending_today += 1
            elif return_dt <= end_5_limit:
                c_expiring_5 += 1
            elif return_dt <= end_10_limit:
                c_expiring_10 += 1

    customer_agreements = CustomerAgreementStats(
        total=c_total,
        ending_today=c_ending_today,
        expiring_5_days=c_expiring_5,
        expiring_10_days=c_expiring_10,
        overdue=c_overdue,
    )

    return DashboardStats(
        active_agreements=active,
        overdue_agreements=overdue,
        pending_agreements=pending,
        booking_requests=booking_requests,
        total_agreements=total,
        due_today=due_today,
        pickups=pickups,
        vehicles=vehicles,
        total_customers=total_customers,
        revenue=RevenueStats(
            collected_this_month=collected_this_month,
            outstanding_balance=outstanding,
            total_all_time=total_all_time,
        ),
        vendor_agreements=vendor_agreements,
        customer_agreements=customer_agreements,
        recent_agreements=recent_agreements,
    )
