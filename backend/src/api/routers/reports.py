"""Reporting and CSV export endpoints.

Gated on VIEW_REPORTS, except the single-agreement statement which follows the
ledger's own permission so anyone who can read a ledger can export it.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.errors import BusinessError, ErrorCode
from src.core.rbac import Permission
from src.services import report_service

router = APIRouter()

# Guards against a range so wide the aggregate scans the whole ledger.
_MAX_RANGE_DAYS = 400


class RevenueSummaryResponse(BaseModel):
    start: datetime
    end: datetime
    gross_charges: str
    adjustments: str
    reversals: str
    net_revenue: str
    payments_collected: str
    deposits_received: str
    deposits_applied: str
    deposits_returned: str


def _resolve_range(start: datetime | None, end: datetime | None) -> tuple[datetime, datetime]:
    """Default to the last 30 days; validate ordering and width."""
    now = datetime.now(timezone.utc)
    end = end or now
    start = start or (end - timedelta(days=30))

    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    if end <= start:
        raise BusinessError(ErrorCode.INVALID_INPUT, "End date must be after start date")
    if (end - start).days > _MAX_RANGE_DAYS:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Date range too wide; maximum is {_MAX_RANGE_DAYS} days",
        )
    return start, end


def _csv(filename: str, body: str) -> Response:
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/agreements/{agreement_id}/ledger.csv")
async def export_agreement_ledger(
    agreement_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_LEDGER))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Full ledger statement for one agreement."""
    filename, body = report_service.agreement_ledger_csv(db, agreement_id)
    return _csv(filename, body)


@router.get("/revenue", response_model=RevenueSummaryResponse)
async def get_revenue_summary(
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_REPORTS))],
    db: Annotated[Session, Depends(get_db)],
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> RevenueSummaryResponse:
    """Revenue totals for a period. Defaults to the last 30 days."""
    start, end = _resolve_range(start, end)
    s = report_service.revenue_summary(db, start, end)
    return RevenueSummaryResponse(
        start=s["start"],
        end=s["end"],
        gross_charges=f"{s['gross_charges']:.2f}",
        adjustments=f"{s['adjustments']:.2f}",
        reversals=f"{s['reversals']:.2f}",
        net_revenue=f"{s['net_revenue']:.2f}",
        payments_collected=f"{s['payments_collected']:.2f}",
        deposits_received=f"{s['deposits_received']:.2f}",
        deposits_applied=f"{s['deposits_applied']:.2f}",
        deposits_returned=f"{s['deposits_returned']:.2f}",
    )


@router.get("/revenue.csv")
async def export_revenue(
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_REPORTS))],
    db: Annotated[Session, Depends(get_db)],
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> Response:
    """Revenue summary for a period as CSV."""
    start, end = _resolve_range(start, end)
    filename, body = report_service.revenue_summary_csv(db, start, end)
    return _csv(filename, body)


@router.get("/vendor-payables.csv")
async def export_vendor_payables(
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_REPORTS))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Per-vendor earned, paid, and outstanding amounts."""
    filename, body = report_service.vendor_payables_csv(db)
    return _csv(filename, body)


@router.get("/fleet-utilization.csv")
async def export_fleet_utilization(
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_REPORTS))],
    db: Annotated[Session, Depends(get_db)],
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> Response:
    """Per-vehicle utilization and revenue over a period."""
    start, end = _resolve_range(start, end)
    filename, body = report_service.fleet_utilization_csv(db, start, end)
    return _csv(filename, body)
