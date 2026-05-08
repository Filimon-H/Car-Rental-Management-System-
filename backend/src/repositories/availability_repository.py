"""Availability repository for checking vehicle availability."""

from datetime import datetime

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.vehicle import Vehicle, VehicleStatus


def check_vehicle_available(
    db: Session,
    vehicle_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    exclude_agreement_id: int | None = None,
) -> bool:
    """Check if a vehicle is available for the given date range.
    
    A vehicle is unavailable if:
    1. It has status other than AVAILABLE
    2. There's an overlapping agreement segment (not cancelled)
    
    Args:
        db: Database session
        vehicle_id: Vehicle to check
        start_datetime: Start of desired rental period
        end_datetime: End of desired rental period
        exclude_agreement_id: Agreement to exclude from overlap check (for extensions)
    
    Returns:
        True if vehicle is available, False otherwise
    """
    # Check vehicle exists and is active
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle or not vehicle.is_active:
        return False
    
    # Check vehicle status (only AVAILABLE vehicles can be booked)
    if vehicle.status not in (VehicleStatus.AVAILABLE, VehicleStatus.RESERVED):
        return False
    
    # Check for overlapping segments
    overlap_query = (
        db.query(AgreementVehicleSegment)
        .join(Agreement)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle_id,
            Agreement.status.not_in([AgreementStatus.CANCELLED, AgreementStatus.CLOSED, AgreementStatus.RETURNED]),
            # Overlap condition: NOT (segment ends before start OR segment starts after end)
            # Which is equivalent to: segment starts before end AND segment ends after start
            AgreementVehicleSegment.start_datetime < end_datetime,
            AgreementVehicleSegment.end_datetime > start_datetime,
        )
    )
    
    if exclude_agreement_id:
        overlap_query = overlap_query.filter(Agreement.id != exclude_agreement_id)
    
    return overlap_query.count() == 0


def get_available_vehicles(
    db: Session,
    start_datetime: datetime,
    end_datetime: datetime,
    vehicle_type: str | None = None,
) -> list[Vehicle]:
    """Get all vehicles available for the given date range.
    
    Args:
        db: Database session
        start_datetime: Start of desired rental period
        end_datetime: End of desired rental period
        vehicle_type: Optional filter by vehicle type
    
    Returns:
        List of available vehicles
    """
    # Get IDs of vehicles with overlapping bookings
    booked_vehicle_ids = (
        db.query(AgreementVehicleSegment.vehicle_id)
        .join(Agreement)
        .filter(
            Agreement.status.not_in([AgreementStatus.CANCELLED, AgreementStatus.CLOSED, AgreementStatus.RETURNED]),
            AgreementVehicleSegment.start_datetime < end_datetime,
            AgreementVehicleSegment.end_datetime > start_datetime,
        )
        .distinct()
        .subquery()
    )
    
    # Query available vehicles
    query = db.query(Vehicle).filter(
        Vehicle.is_active == True,
        Vehicle.status == VehicleStatus.AVAILABLE,
        Vehicle.id.not_in(booked_vehicle_ids),
    )
    
    if vehicle_type:
        query = query.filter(Vehicle.vehicle_type == vehicle_type)
    
    return query.order_by(Vehicle.make, Vehicle.model).all()


def get_vehicle_bookings(
    db: Session,
    vehicle_id: int,
    start_date: datetime,
    end_date: datetime,
) -> list[dict]:
    """Get all bookings for a vehicle in a date range (for calendar view).
    
    Returns list of dicts with agreement_id, start, end, customer_name
    """
    segments = (
        db.query(AgreementVehicleSegment)
        .join(Agreement)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle_id,
            Agreement.status.not_in([AgreementStatus.CANCELLED]),
            AgreementVehicleSegment.start_datetime < end_date,
            AgreementVehicleSegment.end_datetime > start_date,
        )
        .all()
    )
    
    result = []
    for seg in segments:
        result.append({
            "agreement_id": seg.agreement_id,
            "agreement_number": seg.agreement.agreement_number,
            "start": seg.start_datetime,
            "end": seg.end_datetime,
            "status": seg.agreement.status.value,
            "customer_name": seg.agreement.customer.full_name,
        })
    
    return result
