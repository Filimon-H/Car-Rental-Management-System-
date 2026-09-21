"""Vehicle maintenance history and service-due tracking."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from src.core.errors import BusinessError, ErrorCode, NotFoundError
from src.core.logging import get_logger
from src.models.maintenance_record import MaintenanceRecord, MaintenanceType
from src.models.vehicle import Vehicle

logger = get_logger(__name__)


def _ensure_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def create_record(
    db: Session,
    vehicle_id: int,
    service_type: MaintenanceType,
    performed_at: datetime,
    description: str,
    odometer: int | None = None,
    cost: Decimal = Decimal("0"),
    provider: str | None = None,
    notes: str | None = None,
    next_due_date: datetime | None = None,
    next_due_mileage: int | None = None,
    created_by_id: int | None = None,
) -> MaintenanceRecord:
    """Log a service event against a vehicle."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise NotFoundError("Vehicle", vehicle_id)

    if cost < 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Cost cannot be negative")
    if odometer is not None and odometer < 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Odometer cannot be negative")

    record = MaintenanceRecord(
        vehicle_id=vehicle_id,
        service_type=service_type,
        performed_at=_ensure_utc(performed_at),
        description=description,
        odometer=odometer,
        cost=cost,
        provider=provider,
        notes=notes,
        next_due_date=_ensure_utc(next_due_date) if next_due_date else None,
        next_due_mileage=next_due_mileage,
        created_by_id=created_by_id,
    )
    db.add(record)

    # A service reading is the most recent odometer known for the vehicle.
    if odometer is not None and odometer > (vehicle.current_mileage or 0):
        vehicle.current_mileage = odometer

    db.commit()
    db.refresh(record)
    logger.info("Logged %s for vehicle %s", service_type.value, vehicle_id)
    return record


def list_for_vehicle(db: Session, vehicle_id: int) -> list[MaintenanceRecord]:
    """Service history for one vehicle, most recent first."""
    if not db.query(Vehicle.id).filter(Vehicle.id == vehicle_id).first():
        raise NotFoundError("Vehicle", vehicle_id)
    return (
        db.query(MaintenanceRecord)
        .filter(MaintenanceRecord.vehicle_id == vehicle_id)
        .order_by(MaintenanceRecord.performed_at.desc())
        .all()
    )


def delete_record(db: Session, record_id: int) -> None:
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise NotFoundError("Maintenance record", record_id)
    db.delete(record)
    db.commit()


def get_due_vehicles(db: Session, as_of: datetime | None = None) -> list[dict]:
    """Vehicles whose latest service is due by date or by mileage.

    Only the most recent record per vehicle counts — an older record's next-due is
    superseded once the service is performed again.
    """
    as_of = _ensure_utc(as_of or datetime.now(timezone.utc))

    # Latest record id per vehicle.
    latest_ids = (
        db.query(func.max(MaintenanceRecord.id))
        .group_by(MaintenanceRecord.vehicle_id)
        .subquery()
    )
    records = (
        db.query(MaintenanceRecord)
        .options(joinedload(MaintenanceRecord.vehicle))
        .filter(MaintenanceRecord.id.in_(latest_ids))
        .all()
    )

    due = []
    for record in records:
        vehicle = record.vehicle
        if vehicle is None or not vehicle.is_active:
            continue

        reasons = []
        if record.next_due_date and _ensure_utc(record.next_due_date) <= as_of:
            reasons.append("date")
        if (
            record.next_due_mileage is not None
            and vehicle.current_mileage is not None
            and vehicle.current_mileage >= record.next_due_mileage
        ):
            reasons.append("mileage")

        if reasons:
            due.append({
                "vehicle_id": vehicle.id,
                "plate_number": vehicle.plate_number,
                "vehicle": f"{vehicle.make} {vehicle.model}",
                "last_service_type": record.service_type.value,
                "last_service_at": record.performed_at,
                "next_due_date": record.next_due_date,
                "next_due_mileage": record.next_due_mileage,
                "current_mileage": vehicle.current_mileage,
                "due_reason": "+".join(reasons),
            })

    due.sort(key=lambda item: item["plate_number"])
    return due
