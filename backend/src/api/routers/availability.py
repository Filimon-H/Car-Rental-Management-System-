"""Availability router for checking vehicle availability."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.vehicle import Vehicle, VehicleStatus
from src.repositories import availability_repository

router = APIRouter()


class VehicleAvailabilityResponse(BaseModel):
    """Response for available vehicles."""

    id: int
    plate_number: str
    make: str
    model: str
    year: int
    color: str
    vehicle_type: str
    seats: int
    transmission: str
    daily_rate: float

    model_config = {"from_attributes": True}


class AvailabilityCheckResponse(BaseModel):
    """Response for availability check."""

    vehicle_id: int
    available: bool
    message: str | None = None


class BookingSlot(BaseModel):
    """A booking slot for calendar view."""

    agreement_id: int
    agreement_number: str
    start: datetime
    end: datetime
    status: str
    customer_name: str


class VehicleBookingsResponse(BaseModel):
    """Response for vehicle bookings."""

    vehicle_id: int
    plate_number: str
    bookings: list[BookingSlot]


@router.get("/vehicles", response_model=list[VehicleAvailabilityResponse])
async def get_available_vehicles(
    start_datetime: datetime,
    end_datetime: datetime,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_VEHICLES))],
    db: Annotated[Session, Depends(get_db)],
    vehicle_type: str | None = None,
) -> list[VehicleAvailabilityResponse]:
    """Get all vehicles available for the given date range."""
    vehicles = availability_repository.get_available_vehicles(
        db=db,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        vehicle_type=vehicle_type,
    )
    
    return [
        VehicleAvailabilityResponse(
            id=v.id,
            plate_number=v.plate_number,
            make=v.make,
            model=v.model,
            year=v.year,
            color=v.color,
            vehicle_type=v.vehicle_type,
            seats=v.seats,
            transmission=v.transmission,
            daily_rate=float(v.daily_rate),
        )
        for v in vehicles
    ]


@router.get("/check/{vehicle_id}", response_model=AvailabilityCheckResponse)
async def check_vehicle_availability(
    vehicle_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_VEHICLES))],
    db: Annotated[Session, Depends(get_db)],
    exclude_agreement_id: int | None = None,
) -> AvailabilityCheckResponse:
    """Check if a specific vehicle is available for the given date range."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        return AvailabilityCheckResponse(
            vehicle_id=vehicle_id,
            available=False,
            message="Vehicle not found",
        )
    
    available = availability_repository.check_vehicle_available(
        db=db,
        vehicle_id=vehicle_id,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        exclude_agreement_id=exclude_agreement_id,
    )
    
    message = None
    if not available:
        if not vehicle.is_active:
            message = "Vehicle is inactive"
        elif vehicle.status not in (VehicleStatus.AVAILABLE, VehicleStatus.RESERVED):
            message = f"Vehicle is currently {vehicle.status.value}"
        else:
            message = "Vehicle has overlapping bookings"
    
    return AvailabilityCheckResponse(
        vehicle_id=vehicle_id,
        available=available,
        message=message,
    )


@router.get("/bookings/{vehicle_id}", response_model=VehicleBookingsResponse)
async def get_vehicle_bookings(
    vehicle_id: int,
    start_date: datetime,
    end_date: datetime,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> VehicleBookingsResponse:
    """Get all bookings for a vehicle in a date range (for calendar view)."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        return VehicleBookingsResponse(
            vehicle_id=vehicle_id,
            plate_number="Unknown",
            bookings=[],
        )
    
    bookings_data = availability_repository.get_vehicle_bookings(
        db=db,
        vehicle_id=vehicle_id,
        start_date=start_date,
        end_date=end_date,
    )
    
    bookings = [
        BookingSlot(
            agreement_id=b["agreement_id"],
            agreement_number=b["agreement_number"],
            start=b["start"],
            end=b["end"],
            status=b["status"],
            customer_name=b["customer_name"],
        )
        for b in bookings_data
    ]
    
    return VehicleBookingsResponse(
        vehicle_id=vehicle_id,
        plate_number=vehicle.plate_number,
        bookings=bookings,
    )
