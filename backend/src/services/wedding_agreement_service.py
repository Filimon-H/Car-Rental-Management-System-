"""Wedding agreement service for multi-vehicle wedding rentals."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.vehicle import Vehicle, VehicleStatus
from src.repositories import availability_repository
from src.services import ledger_service
from src.models.ledger_entry import LedgerEntryType


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def generate_wedding_agreement_number() -> str:
    """Generate a unique wedding agreement number."""
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d")
    import random
    suffix = f"{random.randint(1000, 9999)}"
    return f"WED-{timestamp}-{suffix}"


def create_wedding_agreement(
    db: Session,
    customer_id: int,
    vehicle_configs: list[dict],  # [{"vehicle_id": int, "daily_rate": Decimal, "start": datetime, "end": datetime}]
    event_date: datetime,
    event_end_date: Optional[datetime] = None,
    deposit_amount: Decimal = Decimal("0"),
    pickup_location: Optional[str] = None,
    return_location: Optional[str] = None,
    notes: Optional[str] = None,
    created_by_id: Optional[int] = None,
) -> Agreement:
    """
    Create a wedding agreement with multiple vehicles.
    
    Wedding agreements can have:
    - Multiple vehicles with different rental periods
    - Vehicles reserved ahead of time but only rented during event window
    - Total calculated from all vehicle segments
    """
    # Validate customer exists
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise ValueError("Customer not found")
    
    if not customer.is_active:
        raise ValueError("Customer is not active")
    
    if not vehicle_configs:
        raise ValueError("At least one vehicle is required")
    
    # Validate all vehicles are available
    for config in vehicle_configs:
        vehicle_id = config["vehicle_id"]
        start_dt = config["start"]
        end_dt = config["end"]
        
        if end_dt <= start_dt:
            raise ValueError(f"End date must be after start date for vehicle {vehicle_id}")
        
        if not availability_repository.check_vehicle_available(
            db, vehicle_id, start_dt, end_dt
        ):
            vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
            plate = vehicle.plate_number if vehicle else "Unknown"
            raise ValueError(f"Vehicle {plate} is not available for the specified dates")
    
    # Determine overall agreement period
    earliest_start = min(c["start"] for c in vehicle_configs)
    latest_end = max(c["end"] for c in vehicle_configs)
    
    # Create agreement (starts as pending_payment until handover/activation)
    agreement = Agreement(
        agreement_number=generate_wedding_agreement_number(),
        agreement_type=AgreementType.WEDDING,
        status=AgreementStatus.PENDING_PAYMENT,
        customer_id=customer_id,
        pickup_datetime=earliest_start,
        expected_return_datetime=latest_end,
        agreed_daily_rate=Decimal("0"),  # Will be sum of vehicles
        deposit_amount=deposit_amount,
        pickup_location=pickup_location,
        return_location=return_location,
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(agreement)
    db.flush()
    
    # Create vehicle segments and update vehicle statuses
    total_charge = Decimal("0")
    
    for config in vehicle_configs:
        vehicle_id = config["vehicle_id"]
        daily_rate = Decimal(str(config["daily_rate"]))
        start_dt = config["start"]
        end_dt = config["end"]
        
        segment = AgreementVehicleSegment(
            agreement_id=agreement.id,
            vehicle_id=vehicle_id,
            start_datetime=start_dt,
            end_datetime=end_dt,
            daily_rate=daily_rate,
        )
        db.add(segment)
        
        # Calculate charge for this segment (24h blocks, round up)
        rental_hours = (end_dt - start_dt).total_seconds() / 3600
        rental_days = int(rental_hours / 24)
        if rental_hours % 24 > 0:
            rental_days += 1
        rental_days = max(1, rental_days)
        
        segment_charge = daily_rate * rental_days
        total_charge += segment_charge
        
        # Update vehicle status if rental starts today or earlier
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if vehicle and start_dt <= datetime.now(start_dt.tzinfo):
            vehicle.status = VehicleStatus.RENTED
        elif vehicle:
            # Mark as reserved for future start
            vehicle.status = VehicleStatus.RESERVED
    
    # Store total agreed rate
    agreement.agreed_daily_rate = total_charge  # Using this field for total for weddings
    
    # Post initial rental charge
    ledger_service.post_charge(
        db=db,
        agreement_id=agreement.id,
        amount=total_charge,
        description=f"Wedding rental ({len(vehicle_configs)} vehicles)",
        entry_type=LedgerEntryType.CHARGE,
        created_by_id=created_by_id,
    )
    
    db.commit()
    db.refresh(agreement)
    
    return agreement


def add_vehicle_to_wedding(
    db: Session,
    agreement_id: int,
    vehicle_id: int,
    daily_rate: Decimal,
    start_datetime: datetime,
    end_datetime: datetime,
    added_by_id: Optional[int] = None,
) -> AgreementVehicleSegment:
    """Add another vehicle to an existing wedding agreement."""
    start_datetime = _ensure_utc(start_datetime)
    end_datetime = _ensure_utc(end_datetime)

    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise ValueError("Agreement not found")
    
    if agreement.agreement_type != AgreementType.WEDDING:
        raise ValueError("Can only add vehicles to wedding agreements")
    
    if agreement.status not in [AgreementStatus.DRAFT, AgreementStatus.PENDING_PAYMENT, AgreementStatus.ACTIVE]:
        raise ValueError("Cannot modify a closed or cancelled agreement")
    
    if end_datetime <= start_datetime:
        raise ValueError("End date must be after start date")
    
    # Check availability
    if not availability_repository.check_vehicle_available(
        db, vehicle_id, start_datetime, end_datetime, exclude_agreement_id=agreement_id
    ):
        raise ValueError("Vehicle is not available for the specified dates")
    
    # Create segment
    segment = AgreementVehicleSegment(
        agreement_id=agreement_id,
        vehicle_id=vehicle_id,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        daily_rate=daily_rate,
    )
    db.add(segment)
    
    # Calculate charge
    rental_hours = (end_datetime - start_datetime).total_seconds() / 3600
    rental_days = int(rental_hours / 24)
    if rental_hours % 24 > 0:
        rental_days += 1
    rental_days = max(1, rental_days)
    
    segment_charge = daily_rate * rental_days
    
    # Update agreement total
    agreement.agreed_daily_rate += segment_charge
    
    # Update expected return if this extends beyond current
    current_return_datetime = _ensure_utc(agreement.expected_return_datetime)
    if end_datetime > current_return_datetime:
        agreement.expected_return_datetime = end_datetime
    
    # Post additional charge
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    vehicle_desc = f"{vehicle.make} {vehicle.model}" if vehicle else f"Vehicle #{vehicle_id}"
    
    ledger_service.post_charge(
        db=db,
        agreement_id=agreement_id,
        amount=segment_charge,
        description=f"Added vehicle: {vehicle_desc} ({rental_days} days)",
        entry_type=LedgerEntryType.CHARGE,
        created_by_id=added_by_id,
    )
    
    # Update vehicle status
    if vehicle and start_datetime <= datetime.now(timezone.utc):
        vehicle.status = VehicleStatus.RENTED
    elif vehicle:
        vehicle.status = VehicleStatus.RESERVED
    
    db.commit()
    db.refresh(segment)
    
    return segment


def get_wedding_totals(db: Session, agreement_id: int) -> dict:
    """Get wedding agreement totals breakdown."""
    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise ValueError("Agreement not found")
    
    segments = (
        db.query(AgreementVehicleSegment)
        .filter(AgreementVehicleSegment.agreement_id == agreement_id)
        .all()
    )
    
    vehicle_totals = []
    grand_total = Decimal("0")
    
    for segment in segments:
        vehicle = db.query(Vehicle).filter(Vehicle.id == segment.vehicle_id).first()
        
        rental_hours = (segment.end_datetime - segment.start_datetime).total_seconds() / 3600
        rental_days = int(rental_hours / 24)
        if rental_hours % 24 > 0:
            rental_days += 1
        rental_days = max(1, rental_days)
        
        segment_total = segment.daily_rate * rental_days
        grand_total += segment_total
        
        vehicle_totals.append({
            "segment_id": segment.id,
            "vehicle_id": segment.vehicle_id,
            "vehicle_info": f"{vehicle.make} {vehicle.model} ({vehicle.plate_number})" if vehicle else "Unknown",
            "start_date": segment.start_datetime,
            "end_date": segment.end_datetime,
            "days": rental_days,
            "daily_rate": segment.daily_rate,
            "total": segment_total,
        })
    
    balance = ledger_service.get_agreement_balance(db, agreement_id)
    
    return {
        "agreement_id": agreement_id,
        "agreement_number": agreement.agreement_number,
        "vehicle_count": len(segments),
        "vehicles": vehicle_totals,
        "subtotal": grand_total,
        "deposit": agreement.deposit_amount,
        "total_charges": ledger_service.get_total_charges(db, agreement_id),
        "total_payments": ledger_service.get_total_payments(db, agreement_id),
        "balance": balance,
    }
