"""Inspection-related business logic."""

from datetime import timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from src.core.errors import BusinessError, ErrorCode
from src.models.agreement import AgreementStatus
from src.models.inspection import Inspection
from src.models.ledger_entry import LedgerEntryType
from src.models.vehicle import VehicleStatus
from src.services import ledger_service


def calculate_damage_total(inspection: Inspection) -> Decimal:
    """Sum estimated damage cost from inspection records."""
    total = Decimal("0")
    for record in inspection.damage_records or []:
        estimated_cost = Decimal(str(record.get("estimated_cost") or 0))
        if estimated_cost > 0:
            total += estimated_cost
    return total


def sign_inspection(
    db: Session,
    inspection: Inspection,
    customer_name: str,
    customer_signature: str | None = None,
) -> Inspection:
    """Finalize an inspection and apply linked business outcomes."""
    if inspection.status == "signed":
        raise BusinessError(ErrorCode.INSPECTION_ALREADY_COMPLETED, "Inspection already signed")

    agreement = inspection.agreement
    if agreement and inspection.inspection_type == "return":
        if agreement.status in (AgreementStatus.ACTIVE, AgreementStatus.OVERDUE):
            actual_return_datetime = inspection.inspection_datetime
            if actual_return_datetime.tzinfo is None:
                actual_return_datetime = actual_return_datetime.replace(tzinfo=timezone.utc)
            else:
                actual_return_datetime = actual_return_datetime.astimezone(timezone.utc)

            agreement.status = AgreementStatus.RETURNED
            agreement.actual_return_datetime = actual_return_datetime
            if inspection.mileage is not None:
                agreement.return_mileage = inspection.mileage

            for segment in agreement.vehicle_segments:
                segment.vehicle.status = VehicleStatus.AVAILABLE
                if inspection.mileage is not None:
                    segment.end_mileage = segment.end_mileage or inspection.mileage
                    segment.vehicle.current_mileage = inspection.mileage

    damage_total = calculate_damage_total(inspection)
    if agreement and inspection.inspection_type in {"return", "damage_report"} and damage_total > 0:
        ledger_service.post_charge(
            db=db,
            agreement_id=agreement.id,
            amount=damage_total,
            description=f"Damage assessment from inspection #{inspection.id}",
            entry_type=LedgerEntryType.DAMAGE_CHARGE,
            notes=f"Auto-posted from {inspection.inspection_type} inspection",
            auto_commit=False,
        )

    inspection.status = "signed"
    inspection.customer_name = customer_name
    inspection.customer_signature = customer_signature
    if not inspection.completed_at:
        inspection.completed_at = inspection.inspection_datetime

    db.commit()
    db.refresh(inspection)
    return inspection
