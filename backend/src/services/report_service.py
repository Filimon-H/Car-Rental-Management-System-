"""Reporting and CSV export.

Reports read from the ledger, which is the single source of truth for money. Nothing
here computes balances independently — it aggregates the same entries the agreement
views use, so an exported figure always reconciles with what staff see on screen.
"""

import csv
import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from src.core.errors import NotFoundError
from src.core.logging import get_logger
from src.models.agreement import Agreement, AgreementStatus
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.ledger_entry import LedgerEntry, LedgerEntryType
from src.models.staff_user import StaffUser
from src.models.vehicle import Vehicle
from src.models.vendor import Vendor
from src.services import vendor_service

logger = get_logger(__name__)

# Entry types that represent money earned, as opposed to deposits held on the
# customer's behalf or transfers of that deposit.
_REVENUE_TYPES = (
    LedgerEntryType.CHARGE,
    LedgerEntryType.LATE_FEE,
    LedgerEntryType.DAMAGE_CHARGE,
)


def _csv_response(header: list[str], rows: Iterable[list[Any]]) -> str:
    """Render rows as CSV text.

    Written with a UTF-8 BOM so Excel opens Amharic text correctly rather than
    showing mojibake.
    """
    buffer = io.StringIO()
    buffer.write("﻿")
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def _fmt(value: Any) -> str:
    """Format a value for a CSV cell."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    return str(value)


# ---------------------------------------------------------------------------
# Agreement ledger statement
# ---------------------------------------------------------------------------


def agreement_ledger_csv(db: Session, agreement_id: int) -> tuple[str, str]:
    """Every ledger entry for one agreement, with a running balance.

    Returns (filename, csv_text).
    """
    agreement = (
        db.query(Agreement)
        .options(joinedload(Agreement.customer))
        .filter(Agreement.id == agreement_id)
        .first()
    )
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)

    entries = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.agreement_id == agreement_id)
        .order_by(LedgerEntry.created_at, LedgerEntry.id)
        .all()
    )

    actor_names = {
        u.id: u.full_name
        for u in db.query(StaffUser).filter(
            StaffUser.id.in_({e.created_by_id for e in entries if e.created_by_id})
        )
    } if entries else {}

    # A received deposit is held, not revenue: it only reduces what is owed
    # once applied. Summing every row subtracted it immediately, so the CSV's
    # final balance read 5,000 below the ledger screen. DEPOSIT_APPLIED still
    # counts, because that is the moment the money is used.
    held_deposit_types = {LedgerEntryType.DEPOSIT, LedgerEntryType.DEPOSIT_RETURN}

    rows = []
    running = Decimal("0")
    for entry in entries:
        if entry.entry_type not in held_deposit_types:
            running += entry.amount
        rows.append([
            _fmt(entry.created_at),
            entry.entry_type.value,
            entry.description,
            _fmt(entry.amount),
            _fmt(running),
            entry.payment_method.value if entry.payment_method else "",
            entry.payment_reference or "",
            actor_names.get(entry.created_by_id, ""),
            entry.notes or "",
        ])

    csv_text = _csv_response(
        [
            "Date", "Type", "Description", "Amount", "Running Balance",
            "Payment Method", "Reference", "Recorded By", "Notes",
        ],
        rows,
    )
    filename = f"ledger_{agreement.agreement_number}.csv"
    logger.info("Generated ledger export for agreement %s (%d entries)", agreement_id, len(entries))
    return filename, csv_text


# ---------------------------------------------------------------------------
# Revenue by period
# ---------------------------------------------------------------------------


def revenue_summary(db: Session, start: datetime, end: datetime) -> dict:
    """Aggregate money movement in a date range, grouped by ledger entry type."""
    # An entry that has been reversed no longer stands, so it must not appear
    # in any revenue figure — a reversed 3,000 payment was still being
    # reported as collected. The ledger is append-only, so exclusion is by
    # the reversed_entry_id link rather than deletion.
    reversed_ids = (
        db.query(LedgerEntry.reversed_entry_id)
        .filter(LedgerEntry.reversed_entry_id.isnot(None))
        .subquery()
    )

    rows = (
        db.query(
            LedgerEntry.entry_type,
            func.coalesce(func.sum(LedgerEntry.amount), 0).label("total"),
            func.count(LedgerEntry.id).label("count"),
        )
        .filter(
            LedgerEntry.created_at >= start,
            LedgerEntry.created_at < end,
            LedgerEntry.id.not_in(reversed_ids),
        )
        .group_by(LedgerEntry.entry_type)
        .all()
    )

    by_type = {r.entry_type.value: {"total": Decimal(str(r.total)), "count": r.count} for r in rows}

    def total_of(*types: LedgerEntryType) -> Decimal:
        return sum((by_type.get(t.value, {}).get("total", Decimal("0")) for t in types), Decimal("0"))

    charges = total_of(*_REVENUE_TYPES)
    adjustments = total_of(LedgerEntryType.ADJUSTMENT)
    # Payments and deposits are stored negative; report them as positive inflows.
    payments_collected = -total_of(LedgerEntryType.PAYMENT)
    deposits_received = -total_of(LedgerEntryType.DEPOSIT)
    deposits_returned = total_of(LedgerEntryType.DEPOSIT_RETURN)
    deposits_applied = -total_of(LedgerEntryType.DEPOSIT_APPLIED)
    reversals = total_of(LedgerEntryType.REVERSAL)

    return {
        "start": start,
        "end": end,
        "gross_charges": charges,
        "adjustments": adjustments,
        # The reversal and the entry it undid are both excluded above, so
        # adding reversals here would count the undo as revenue.
        "net_revenue": charges + adjustments,
        "payments_collected": payments_collected,
        "deposits_received": deposits_received,
        "deposits_returned": deposits_returned,
        "deposits_applied": deposits_applied,
        "reversals": reversals,
        "by_type": by_type,
    }


def revenue_summary_csv(db: Session, start: datetime, end: datetime) -> tuple[str, str]:
    """Revenue summary for a period, plus a per-entry-type breakdown."""
    summary = revenue_summary(db, start, end)

    rows: list[list[Any]] = [
        ["Period start", _fmt(start)],
        ["Period end", _fmt(end)],
        [],
        ["Gross charges", _fmt(summary["gross_charges"])],
        ["Adjustments", _fmt(summary["adjustments"])],
        ["Reversals", _fmt(summary["reversals"])],
        ["Net revenue", _fmt(summary["net_revenue"])],
        [],
        ["Payments collected", _fmt(summary["payments_collected"])],
        ["Deposits received", _fmt(summary["deposits_received"])],
        ["Deposits applied to charges", _fmt(summary["deposits_applied"])],
        ["Deposits returned", _fmt(summary["deposits_returned"])],
        [],
        ["Breakdown by entry type", "", ""],
        ["Entry type", "Total", "Entries"],
    ]
    for entry_type, data in sorted(summary["by_type"].items()):
        rows.append([entry_type, _fmt(data["total"]), data["count"]])

    csv_text = _csv_response(["Metric", "Value", ""], rows)
    filename = f"revenue_{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}.csv"
    return filename, csv_text


# ---------------------------------------------------------------------------
# Vendor payables
# ---------------------------------------------------------------------------


def vendor_payables_csv(db: Session) -> tuple[str, str]:
    """Commissioned earnings, payments made, and outstanding balance per vendor."""
    vendors = db.query(Vendor).filter(Vendor.is_active.is_(True)).all()

    rows = []
    for vendor in vendors:
        summary = vendor_service.get_vendor_payable_summary(db, vendor.id)
        rows.append([
            summary["vendor_name"],
            _fmt(summary["commission_rate"]),
            summary["agreement_count"],
            _fmt(summary["reserved_amount"]),
            _fmt(summary["earned_amount"]),
            _fmt(summary["paid_amount"]),
            _fmt(summary["outstanding_payable"]),
        ])

    rows.sort(key=lambda r: Decimal(r[6] or "0"), reverse=True)

    csv_text = _csv_response(
        [
            "Vendor", "Commission %", "Agreements", "Reserved (upcoming)",
            "Earned", "Paid", "Outstanding",
        ],
        rows,
    )
    filename = f"vendor_payables_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return filename, csv_text


# ---------------------------------------------------------------------------
# Fleet utilization
# ---------------------------------------------------------------------------


def fleet_utilization_csv(db: Session, start: datetime, end: datetime) -> tuple[str, str]:
    """Per-vehicle rented days and revenue over a window.

    Rented days count the overlap between each booked segment and the window, so a
    rental that starts before or ends after the window contributes only the portion
    inside it.
    """
    window_days = max((end - start).total_seconds() / 86400, 0)

    vehicles = (
        db.query(Vehicle)
        .options(joinedload(Vehicle.vendor))
        .filter(Vehicle.is_active.is_(True))
        .all()
    )

    segments = (
        db.query(AgreementVehicleSegment)
        .join(Agreement)
        .options(joinedload(AgreementVehicleSegment.agreement))
        .filter(
            Agreement.status.not_in([AgreementStatus.CANCELLED, AgreementStatus.BOOKING_REQUESTED]),
            AgreementVehicleSegment.start_datetime < end,
            AgreementVehicleSegment.end_datetime > start,
        )
        .all()
    )

    rented_days: dict[int, float] = {}
    revenue: dict[int, Decimal] = {}
    agreements_seen: dict[int, set[int]] = {}

    for segment in segments:
        seg_start = max(_as_utc(segment.start_datetime), start)
        seg_end = min(_as_utc(segment.end_datetime), end)
        overlap_days = max((seg_end - seg_start).total_seconds() / 86400, 0)
        rented_days[segment.vehicle_id] = rented_days.get(segment.vehicle_id, 0) + overlap_days
        revenue[segment.vehicle_id] = revenue.get(segment.vehicle_id, Decimal("0")) + (
            segment.daily_rate * Decimal(str(round(overlap_days, 2)))
        )
        agreements_seen.setdefault(segment.vehicle_id, set()).add(segment.agreement_id)

    rows = []
    for vehicle in vehicles:
        days = rented_days.get(vehicle.id, 0)
        utilization = (days / window_days * 100) if window_days else 0
        rows.append([
            vehicle.plate_number,
            f"{vehicle.make} {vehicle.model}",
            vehicle.vendor.company_name if vehicle.vendor else "",
            vehicle.status.value,
            f"{days:.1f}",
            f"{window_days:.1f}",
            f"{utilization:.1f}",
            len(agreements_seen.get(vehicle.id, set())),
            _fmt(revenue.get(vehicle.id, Decimal("0")).quantize(Decimal("0.01"))),
        ])

    rows.sort(key=lambda r: float(r[6]), reverse=True)

    csv_text = _csv_response(
        [
            "Plate", "Vehicle", "Vendor", "Status", "Days Rented",
            "Days In Period", "Utilization %", "Agreements", "Revenue",
        ],
        rows,
    )
    filename = f"fleet_utilization_{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}.csv"
    return filename, csv_text


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
