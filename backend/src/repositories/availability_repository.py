"""Availability repository for checking vehicle availability."""

from datetime import datetime

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.vehicle import Vehicle, VehicleStatus


# Statuses a vehicle can be booked from. MAINTENANCE and INACTIVE are
# operational holds; RENTED means it is out now and its own segment will be
# caught by the overlap check.
_BOOKABLE_STATUSES = (VehicleStatus.AVAILABLE, VehicleStatus.RESERVED)

#: A rented car can be offered for a later window only while its current
#: rental is on time, since only then is its return date known.
_RENTED = VehicleStatus.RENTED


def _vehicles_with_agreement_in(statuses, exclude_agreement_id: int | None = None):
    """Subquery of vehicle ids holding an agreement in one of these statuses."""
    from sqlalchemy import select

    q = (
        select(AgreementVehicleSegment.vehicle_id)
        .join(Agreement)
        .filter(Agreement.status.in_(list(statuses)))
    )
    if exclude_agreement_id:
        q = q.filter(Agreement.id != exclude_agreement_id)
    return q.distinct()


def _status_allows_future_window(db: Session, vehicle: Vehicle, exclude_agreement_id: int | None) -> bool:
    """Whether today's status lets the car be promised for some window.

    The gate used to refuse every RENTED car, so one due back on the 10th
    could not be offered or approved for the 20th. Today's status says the
    car is out, not when it is free — the overlap check answers that.

    What status cannot tell us is when an overdue car will be back: its
    return date has passed without a return. Such a car is never offered,
    whatever its status says, and neither is one marked RENTED with no
    rental behind it, since nothing records when it returns.
    """
    if vehicle.status not in (*_BOOKABLE_STATUSES, _RENTED):
        return False
    overdue = db.query(_vehicles_with_agreement_in([AgreementStatus.OVERDUE], exclude_agreement_id).subquery())
    if vehicle.id in {row[0] for row in overdue.all()}:
        return False
    if vehicle.status == _RENTED:
        active = db.query(_vehicles_with_agreement_in([AgreementStatus.ACTIVE], exclude_agreement_id).subquery())
        return vehicle.id in {row[0] for row in active.all()}
    return True


#: Statuses that never occupy a vehicle.
_RELEASED_STATUSES = [
    AgreementStatus.CANCELLED,
    AgreementStatus.CLOSED,
    AgreementStatus.RETURNED,
]


def _excluded_statuses(holds_only: bool) -> list[AgreementStatus]:
    """Which agreements to ignore when looking for an overlap."""
    if holds_only:
        return _RELEASED_STATUSES + [AgreementStatus.BOOKING_REQUESTED, AgreementStatus.DRAFT]
    return _RELEASED_STATUSES


def check_vehicle_available(
    db: Session,
    vehicle_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    exclude_agreement_id: int | None = None,
    skip_status_check: bool = False,
    holds_only: bool = False,
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
        exclude_agreement_id: Agreement to exclude from overlap check. Use when an
            agreement's own segments would otherwise count against it (extensions,
            re-validating an existing booking).
        skip_status_check: Bypass the vehicle status gate. Only for extending an
            agreement that already holds this vehicle, where RENTED is the expected
            state. Never set this when attaching a vehicle the agreement does not
            already hold — that is how a RENTED vehicle gets double-booked.
        holds_only: Count only agreements that genuinely hold the vehicle,
            ignoring unapproved booking requests. Creating a booking does not
            check availability, so two overlapping requests can always exist;
            counting them as holds meant neither could then be approved —
            a deadlock staff could only escape by cancelling one. Approval is
            the moment a request becomes a hold, so it is the one caller that
            needs this.

    Returns:
        True if vehicle is available, False otherwise
    """
    # Check vehicle exists and is active
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle or not vehicle.is_active:
        return False

    # Check vehicle status. Skipped only for extensions, where the vehicle is
    # legitimately RENTED by the very agreement being extended.
    if not skip_status_check and not _status_allows_future_window(db, vehicle, exclude_agreement_id):
        return False
    
    # Check for overlapping segments
    overlap_query = (
        db.query(AgreementVehicleSegment)
        .join(Agreement)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle_id,
            Agreement.status.not_in(_excluded_statuses(holds_only)),
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
    holds_only: bool = False,
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
    from sqlalchemy import select
    booked_vehicle_ids_sq = (
        select(AgreementVehicleSegment.vehicle_id)
        .join(Agreement)
        .filter(
            # holds_only: the customer search passes it, so a pending request
            # — which holds nothing until approved — does not hide a car.
            Agreement.status.not_in(_excluded_statuses(holds_only)),
            AgreementVehicleSegment.start_datetime < end_datetime,
            AgreementVehicleSegment.end_datetime > start_datetime,
        )
        .distinct()
    )

    # Query available vehicles.
    #
    # The status gate must match check_vehicle_available, which accepts
    # RESERVED as well as AVAILABLE. RESERVED only records that some future
    # booking exists; it says nothing about the window being asked for, and
    # the overlap subquery above already excludes vehicles actually booked
    # across these dates. Filtering on AVAILABLE alone hid every car that had
    # any upcoming rental, so a vehicle free in October vanished from the list
    # because of a booking in September — while the single-vehicle check
    # correctly reported it as available.
    # Same rule as check_vehicle_available: a rented car qualifies while its
    # rental is on time (the overlap check then confines it to windows after
    # the return); an overdue one never does.
    query = db.query(Vehicle).filter(
        Vehicle.is_active == True,
        Vehicle.status.in_([*_BOOKABLE_STATUSES, _RENTED]),
        Vehicle.id.not_in(booked_vehicle_ids_sq),
        Vehicle.id.not_in(_vehicles_with_agreement_in([AgreementStatus.OVERDUE])),
        or_(
            Vehicle.status != _RENTED,
            Vehicle.id.in_(_vehicles_with_agreement_in([AgreementStatus.ACTIVE])),
        ),
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
