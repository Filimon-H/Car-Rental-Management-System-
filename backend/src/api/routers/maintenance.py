"""Vehicle maintenance endpoints.

Reading history follows VIEW_VEHICLES; recording or deleting work follows
MANAGE_VEHICLES, matching how the rest of the fleet is governed.
"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.maintenance_record import MaintenanceType
from src.services import maintenance_service

router = APIRouter()


class MaintenanceRecordCreate(BaseModel):
    service_type: MaintenanceType
    performed_at: datetime
    description: str = Field(..., min_length=1, max_length=255)
    odometer: int | None = Field(None, ge=0)
    cost: Decimal = Field(Decimal("0"), ge=0, decimal_places=2)
    provider: str | None = Field(None, max_length=200)
    notes: str | None = None
    next_due_date: datetime | None = None
    next_due_mileage: int | None = Field(None, ge=0)


class MaintenanceRecordResponse(BaseModel):
    id: int
    vehicle_id: int
    service_type: MaintenanceType
    performed_at: datetime
    description: str
    odometer: int | None
    cost: Decimal
    provider: str | None
    notes: str | None
    next_due_date: datetime | None
    next_due_mileage: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceDueItem(BaseModel):
    vehicle_id: int
    plate_number: str
    vehicle: str
    last_service_type: str
    last_service_at: datetime
    next_due_date: datetime | None
    next_due_mileage: int | None
    current_mileage: int | None
    due_reason: str


@router.get("/due", response_model=list[MaintenanceDueItem])
async def list_due_vehicles(
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_VEHICLES))],
    db: Annotated[Session, Depends(get_db)],
) -> list[MaintenanceDueItem]:
    """Vehicles overdue for service, by date or by mileage."""
    return [MaintenanceDueItem(**item) for item in maintenance_service.get_due_vehicles(db)]


@router.get("/vehicles/{vehicle_id}", response_model=list[MaintenanceRecordResponse])
async def list_vehicle_maintenance(
    vehicle_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_VEHICLES))],
    db: Annotated[Session, Depends(get_db)],
) -> list[MaintenanceRecordResponse]:
    """Service history for a vehicle, most recent first."""
    records = maintenance_service.list_for_vehicle(db, vehicle_id)
    return [MaintenanceRecordResponse.model_validate(r) for r in records]


@router.post("/vehicles/{vehicle_id}", response_model=MaintenanceRecordResponse, status_code=201)
async def create_maintenance_record(
    vehicle_id: int,
    data: MaintenanceRecordCreate,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_VEHICLES))],
    db: Annotated[Session, Depends(get_db)],
) -> MaintenanceRecordResponse:
    """Log a service event."""
    record = maintenance_service.create_record(
        db=db,
        vehicle_id=vehicle_id,
        service_type=data.service_type,
        performed_at=data.performed_at,
        description=data.description,
        odometer=data.odometer,
        cost=data.cost,
        provider=data.provider,
        notes=data.notes,
        next_due_date=data.next_due_date,
        next_due_mileage=data.next_due_mileage,
        created_by_id=current_user.id,
    )
    return MaintenanceRecordResponse.model_validate(record)


@router.delete("/{record_id}", status_code=204)
async def delete_maintenance_record(
    record_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_VEHICLES))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    maintenance_service.delete_record(db, record_id)
