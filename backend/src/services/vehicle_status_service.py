"""Derive fleet status from all agreements holding a vehicle."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.vehicle import Vehicle, VehicleStatus


def expected_vehicle_status(
    db: Session,
    vehicle: Vehicle,
    exclude_agreement_id: int | None = None,
    now: datetime | None = None,
) -> VehicleStatus:
    """Keep operational holds; otherwise rented takes precedence over reserved.

    An expired scheduled end is not evidence of return. ACTIVE/OVERDUE holds
    last until a terminal transition. BOOKING_REQUESTED never holds a vehicle.
    Wedding pending-payment segments retain their existing date-based rule.
    """
    if vehicle.status in (VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE):
        return vehicle.status
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    query = (
        db.query(AgreementVehicleSegment, Agreement.status, Agreement.agreement_type)
        .join(Agreement)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle.id,
            Agreement.status.in_([
                AgreementStatus.DRAFT, AgreementStatus.PENDING_PAYMENT,
                AgreementStatus.ACTIVE, AgreementStatus.OVERDUE,
            ]),
        )
    )
    if exclude_agreement_id is not None:
        query = query.filter(Agreement.id != exclude_agreement_id)
    result = VehicleStatus.AVAILABLE
    for segment, status, agreement_type in query.all():
        if status in (AgreementStatus.ACTIVE, AgreementStatus.OVERDUE):
            return VehicleStatus.RENTED
        start = segment.start_datetime
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if agreement_type == AgreementType.WEDDING and start <= now:
            return VehicleStatus.RENTED
        result = VehicleStatus.RESERVED
    return result


def release_vehicle(db: Session, vehicle: Vehicle, agreement_id: int) -> None:
    """Release only this agreement's hold without committing the transaction."""
    vehicle.status = expected_vehicle_status(db, vehicle, exclude_agreement_id=agreement_id)
