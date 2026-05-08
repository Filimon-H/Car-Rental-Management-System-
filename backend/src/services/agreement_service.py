"""Agreement service for creating and managing rental agreements."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from src.core.errors import BusinessError, ErrorCode, NotFoundError
from src.core.logging import get_logger
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.vehicle import Vehicle, VehicleStatus
from src.models.ledger_entry import LedgerEntryType
from src.repositories import availability_repository
from src.services import billing_service, ledger_service

logger = get_logger(__name__)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_balance_due_before_deposit(db: Session, agreement_id: int) -> Decimal:
    """Outstanding balance before applying held deposit."""
    entries = ledger_service.get_ledger_entries(db, agreement_id)
    balance_due = Decimal("0")
    for entry in entries:
        if entry.entry_type in (
            LedgerEntryType.CHARGE,
            LedgerEntryType.DAMAGE_CHARGE,
            LedgerEntryType.LATE_FEE,
        ):
            balance_due += entry.amount
        elif entry.entry_type == LedgerEntryType.ADJUSTMENT:
            balance_due += entry.amount
        elif entry.entry_type in (LedgerEntryType.PAYMENT, LedgerEntryType.DEPOSIT_APPLIED):
            balance_due += entry.amount
    return max(Decimal("0"), balance_due)


def _validate_activation_requirements(db: Session, agreement: Agreement) -> None:
    """Require agreed deposit and advance payment before handover."""
    held_deposit = ledger_service.get_deposit_held(db, agreement.id)
    total_payments = ledger_service.get_total_payments(db, agreement.id)

    if agreement.deposit_amount > 0 and held_deposit < agreement.deposit_amount:
        missing = agreement.deposit_amount - held_deposit
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Required deposit not fully received. Remaining deposit due: {missing}",
        )

    if agreement.advance_payment and total_payments < agreement.advance_payment:
        missing = agreement.advance_payment - total_payments
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Required advance payment not fully received. Remaining advance due: {missing}",
        )


def generate_agreement_number(db: Session) -> str:
    """Generate a unique agreement number."""
    # Format: AGR-YYYYMMDD-XXXX where XXXX is sequential
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"AGR-{today}-"
    
    # Find the last agreement number for today
    last = (
        db.query(Agreement)
        .filter(Agreement.agreement_number.like(f"{prefix}%"))
        .order_by(Agreement.agreement_number.desc())
        .first()
    )
    
    if last:
        last_seq = int(last.agreement_number.split("-")[-1])
        new_seq = last_seq + 1
    else:
        new_seq = 1
    
    return f"{prefix}{new_seq:04d}"


def create_standard_agreement(
    db: Session,
    customer_id: int,
    vehicle_id: int,
    pickup_datetime: datetime,
    expected_return_datetime: datetime,
    daily_rate: Decimal,
    deposit_amount: Decimal = Decimal("0"),
    advance_payment: Decimal | None = None,
    pickup_location: str | None = None,
    return_location: str | None = None,
    notes: str | None = None,
    created_by_id: int | None = None,
    agreement_type: AgreementType = AgreementType.CUSTOMER_VEHICLE,
    driver_id: int | None = None,
    collateral_person_id: int | None = None,
) -> Agreement:
    """Create a new standard rental agreement.
    
    Validates:
    - Customer exists and is active
    - Vehicle exists and is active
    - Vehicle is available for the date range
    - Dates are valid
    - Driver exists if provided
    - Collateral person exists and belongs to customer if provided
    """
    from src.models.driver import Driver
    from src.models.collateral_person import CollateralPerson
    
    # Validate customer
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer or not customer.is_active:
        raise NotFoundError("Customer", customer_id)
    
    # Validate vehicle
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle or not vehicle.is_active:
        raise NotFoundError("Vehicle", vehicle_id)
    
    # Validate driver if provided
    if driver_id:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        if not driver or not driver.is_active:
            raise NotFoundError("Driver", driver_id)
    
    # Validate collateral person if provided
    if collateral_person_id:
        collateral = db.query(CollateralPerson).filter(CollateralPerson.id == collateral_person_id).first()
        if not collateral or not collateral.is_active:
            raise NotFoundError("Collateral Person", collateral_person_id)
        # Ensure collateral belongs to the customer
        if collateral.customer_id != customer_id:
            raise BusinessError(
                ErrorCode.INVALID_INPUT,
                "Collateral person does not belong to the selected customer"
            )
    
    # Validate dates
    if expected_return_datetime <= pickup_datetime:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "Return date must be after pickup date"
        )
    
    # Check availability (CRITICAL - constitution requirement)
    if not availability_repository.check_vehicle_available(
        db, vehicle_id, pickup_datetime, expected_return_datetime
    ):
        raise BusinessError(
            ErrorCode.VEHICLE_NOT_AVAILABLE,
            f"Vehicle {vehicle.plate_number} is not available for the selected dates"
        )
    
    # Generate agreement number
    agreement_number = generate_agreement_number(db)
    
    # Create agreement (starts as pending_payment until handover/activation)
    agreement = Agreement(
        agreement_number=agreement_number,
        agreement_type=agreement_type,
        status=AgreementStatus.PENDING_PAYMENT,
        customer_id=customer_id,
        driver_id=driver_id,
        collateral_person_id=collateral_person_id,
        pickup_datetime=pickup_datetime,
        expected_return_datetime=expected_return_datetime,
        agreed_daily_rate=daily_rate,
        deposit_amount=deposit_amount,
        advance_payment=advance_payment,
        pickup_location=pickup_location,
        return_location=return_location,
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(agreement)
    db.flush()  # Get the agreement ID
    
    # Create vehicle segment
    segment = AgreementVehicleSegment(
        agreement_id=agreement.id,
        vehicle_id=vehicle_id,
        start_datetime=pickup_datetime,
        end_datetime=expected_return_datetime,
        daily_rate=daily_rate,
    )
    db.add(segment)
    
    # Update vehicle status
    vehicle.status = VehicleStatus.RENTED
    
    # Calculate and post initial rental charge
    days, charge = billing_service.calculate_rental_charge(
        pickup_datetime, expected_return_datetime, daily_rate
    )
    ledger_service.post_charge(
        db=db,
        agreement_id=agreement.id,
        amount=charge,
        description=f"Rental charge: {days} days @ {daily_rate}/day",
        entry_type=LedgerEntryType.CHARGE,
        created_by_id=created_by_id,
    )
    
    db.commit()
    db.refresh(agreement)
    
    logger.info(f"Created agreement {agreement_number} for customer {customer_id}, vehicle {vehicle_id}")
    return agreement


def close_agreement(
    db: Session,
    agreement_id: int,
    actual_return_datetime: datetime,
    return_mileage: int | None = None,
    closed_by_id: int | None = None,
    notes: str | None = None,
) -> Agreement:
    """Close an agreement (vehicle returned).
    
    Calculates and posts:
    - Late fees (if applicable)
    - Final balance
    """
    from sqlalchemy.orm import joinedload
    
    agreement = (
        db.query(Agreement)
        .options(joinedload(Agreement.vehicle_segments).joinedload(AgreementVehicleSegment.vehicle))
        .filter(Agreement.id == agreement_id)
        .first()
    )
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)
    
    if agreement.status not in (AgreementStatus.ACTIVE, AgreementStatus.OVERDUE, AgreementStatus.RETURNED):
        raise BusinessError(
            ErrorCode.AGREEMENT_ALREADY_CLOSED,
            f"Agreement is already {agreement.status.value}"
        )

    actual_return_datetime = _ensure_utc(actual_return_datetime)
    expected_return_datetime = _ensure_utc(agreement.expected_return_datetime)
    
    # Calculate late fee if applicable
    if actual_return_datetime > expected_return_datetime:
        late_fee = billing_service.calculate_late_fee(
            expected_return_datetime,
            actual_return_datetime,
            agreement.agreed_daily_rate,
        )
        if late_fee > 0:
            ledger_service.post_charge(
                db=db,
                agreement_id=agreement_id,
                amount=late_fee,
                description="Late return fee",
                entry_type=LedgerEntryType.LATE_FEE,
                created_by_id=closed_by_id,
                auto_commit=False,  # Let close_agreement handle the commit
            )

    balance_due_before_deposit = _get_balance_due_before_deposit(db, agreement_id)
    held_deposit = ledger_service.get_deposit_held(db, agreement_id)
    deposit_to_apply = min(balance_due_before_deposit, held_deposit)
    if deposit_to_apply > 0:
        ledger_service.apply_deposit(
            db=db,
            agreement_id=agreement_id,
            amount=deposit_to_apply,
            created_by_id=closed_by_id,
            notes="Automatically applied during agreement close",
            auto_commit=False,
        )
    
    # Update agreement
    agreement.status = AgreementStatus.CLOSED
    agreement.actual_return_datetime = actual_return_datetime
    agreement.return_mileage = return_mileage
    agreement.closed_at = datetime.now(timezone.utc)
    agreement.closed_by_id = closed_by_id
    if notes:
        agreement.notes = (agreement.notes or "") + f"\n[Close] {notes}"
    
    # Update vehicle segments end mileage
    for segment in agreement.vehicle_segments:
        if return_mileage and not segment.end_mileage:
            segment.end_mileage = return_mileage
        
        # Set vehicle back to available
        vehicle = segment.vehicle
        vehicle.status = VehicleStatus.AVAILABLE
        if return_mileage:
            vehicle.current_mileage = return_mileage
    
    db.commit()
    db.refresh(agreement)
    
    logger.info(f"Closed agreement {agreement.agreement_number}")
    return agreement


def mark_agreement_returned(
    db: Session,
    agreement_id: int,
    actual_return_datetime: datetime,
    return_mileage: int | None = None,
    returned_by_id: int | None = None,
    notes: str | None = None,
) -> Agreement:
    """Mark an agreement as returned (car is back, settlement may still be pending)."""
    from sqlalchemy.orm import joinedload

    agreement = (
        db.query(Agreement)
        .options(joinedload(Agreement.vehicle_segments).joinedload(AgreementVehicleSegment.vehicle))
        .filter(Agreement.id == agreement_id)
        .first()
    )
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)

    if agreement.status not in (AgreementStatus.ACTIVE, AgreementStatus.OVERDUE):
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Cannot mark returned from status {agreement.status.value}",
        )

    actual_return_datetime = _ensure_utc(actual_return_datetime)
    agreement.status = AgreementStatus.RETURNED
    agreement.actual_return_datetime = actual_return_datetime
    agreement.return_mileage = return_mileage
    if returned_by_id:
        agreement.closed_by_id = returned_by_id
    if notes:
        agreement.notes = (agreement.notes or "") + f"\n[Returned] {notes}"

    for segment in agreement.vehicle_segments:
        vehicle = segment.vehicle
        vehicle.status = VehicleStatus.AVAILABLE
        if return_mileage:
            segment.end_mileage = segment.end_mileage or return_mileage
            vehicle.current_mileage = return_mileage

    db.commit()
    db.refresh(agreement)
    return agreement


def activate_agreement(
    db: Session,
    agreement_id: int,
    activated_by_id: int | None = None,
    notes: str | None = None,
) -> Agreement:
    """Activate an agreement (handover done)."""
    from sqlalchemy.orm import joinedload

    agreement = (
        db.query(Agreement)
        .options(joinedload(Agreement.vehicle_segments).joinedload(AgreementVehicleSegment.vehicle))
        .filter(Agreement.id == agreement_id)
        .first()
    )
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)

    if agreement.status not in (AgreementStatus.DRAFT, AgreementStatus.PENDING_PAYMENT):
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Cannot activate from status {agreement.status.value}",
        )

    _validate_activation_requirements(db, agreement)

    agreement.status = AgreementStatus.ACTIVE
    if notes:
        agreement.notes = (agreement.notes or "") + f"\n[Activate] {notes}"

    for segment in agreement.vehicle_segments:
        segment.vehicle.status = VehicleStatus.RENTED

    db.commit()
    db.refresh(agreement)
    return agreement


def extend_agreement(
    db: Session,
    agreement_id: int,
    new_return_datetime: datetime,
    extended_by_id: int | None = None,
) -> Agreement:
    """Extend an agreement's return date.
    
    Validates vehicle still available for extension period.
    """
    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)
    
    if agreement.status != AgreementStatus.ACTIVE:
        raise BusinessError(
            ErrorCode.AGREEMENT_CANNOT_EXTEND,
            f"Cannot extend agreement with status {agreement.status.value}"
        )

    new_return_datetime = _ensure_utc(new_return_datetime)
    current_return_datetime = _ensure_utc(agreement.expected_return_datetime)

    if new_return_datetime <= current_return_datetime:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "New return date must be after current expected return date"
        )
    
    # Check availability for extension period
    for segment in agreement.vehicle_segments:
        conflicting_segment = (
            db.query(AgreementVehicleSegment)
            .join(Agreement)
            .filter(
                AgreementVehicleSegment.vehicle_id == segment.vehicle_id,
                Agreement.id != agreement_id,
                Agreement.status.not_in(
                    [AgreementStatus.CANCELLED, AgreementStatus.CLOSED, AgreementStatus.RETURNED]
                ),
                AgreementVehicleSegment.start_datetime < new_return_datetime,
                AgreementVehicleSegment.end_datetime > current_return_datetime,
            )
            .first()
        )
        if conflicting_segment:
            raise BusinessError(
                ErrorCode.VEHICLE_NOT_AVAILABLE,
                f"Vehicle {segment.vehicle.plate_number} not available for extension"
            )
    
    # Calculate extension charge
    ext_days, ext_charge = billing_service.calculate_extension_charge(
        current_return_datetime,
        new_return_datetime,
        agreement.agreed_daily_rate,
    )
    
    # Update agreement
    old_return = current_return_datetime
    agreement.expected_return_datetime = new_return_datetime
    
    # Update vehicle segments
    for segment in agreement.vehicle_segments:
        segment.end_datetime = new_return_datetime
    
    # Post extension charge
    if ext_charge > 0:
        ledger_service.post_charge(
            db=db,
            agreement_id=agreement_id,
            amount=ext_charge,
            description=f"Extension charge: {ext_days} additional days",
            entry_type=LedgerEntryType.CHARGE,
            created_by_id=extended_by_id,
        )
    
    db.commit()
    db.refresh(agreement)
    
    logger.info(f"Extended agreement {agreement.agreement_number} from {old_return} to {new_return_datetime}")
    return agreement


def get_agreement_summary(db: Session, agreement_id: int) -> dict[str, Any]:
    """Get agreement details with balance summary."""
    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)
    
    entries = ledger_service.get_ledger_entries(db, agreement_id)

    total_charges = Decimal("0")
    total_payments = Decimal("0")
    deposit_received = Decimal("0")
    deposit_applied = Decimal("0")
    deposit_returned = Decimal("0")

    for e in entries:
        if e.entry_type in (LedgerEntryType.CHARGE, LedgerEntryType.DAMAGE_CHARGE, LedgerEntryType.LATE_FEE):
            total_charges += e.amount
        elif e.entry_type == LedgerEntryType.ADJUSTMENT:
            if e.amount >= 0:
                total_charges += e.amount
            else:
                total_payments += abs(e.amount)
        elif e.entry_type == LedgerEntryType.PAYMENT:
            total_payments += abs(e.amount)
        elif e.entry_type == LedgerEntryType.DEPOSIT:
            deposit_received += abs(e.amount)
        elif e.entry_type == LedgerEntryType.DEPOSIT_APPLIED:
            deposit_applied += abs(e.amount)
        elif e.entry_type == LedgerEntryType.DEPOSIT_RETURN:
            deposit_returned += e.amount

    deposit_held = deposit_received - deposit_applied - deposit_returned
    if deposit_held < 0:
        deposit_held = Decimal("0")

    balance_due = total_charges - total_payments - deposit_applied
    if balance_due < 0:
        balance_due = Decimal("0")

    return {
        "agreement": agreement,
        "balance": balance_due,
        "total_charges": total_charges,
        "total_payments": total_payments,
        "deposit_received": deposit_received,
        "deposit_applied": deposit_applied,
        "deposit_returned": deposit_returned,
        "deposit_held": deposit_held,
        "balance_due": balance_due,
        "ledger_entries": entries,
    }
