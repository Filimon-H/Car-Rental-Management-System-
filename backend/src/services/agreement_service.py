"""Agreement service for creating and managing rental agreements."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from src.core.errors import BusinessError, ErrorCode, NotFoundError
from src.core.logging import get_logger
from src.core.config import settings
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.vehicle import Vehicle, VehicleStatus
from src.models.ledger_entry import LedgerEntry, LedgerEntryType
from src.repositories import availability_repository
from src.services import billing_service, ledger_service
from src.services.vehicle_status_service import release_vehicle

logger = get_logger(__name__)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _business_now_as_stored() -> datetime:
    """Current Addis wall time tagged like the app's stored business datetimes."""
    local_now = datetime.now(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)
    return local_now.replace(tzinfo=timezone.utc)


def _now_matching_input(value: datetime) -> datetime:
    """Return a comparable now for either UTC-aware or stored wall-clock input."""
    return datetime.now(timezone.utc) if value.tzinfo is not None else _business_now_as_stored()


def _calculate_balance_breakdown(db: Session, agreement_id: int) -> dict:
    """Single source of truth for agreement balance.

    Returns a dict with total_charges, total_payments, deposit_received,
    deposit_applied, deposit_returned, deposit_held, and balance_due.
    All callers must use this instead of implementing their own logic.
    """
    total_charges = ledger_service.get_total_charges(db, agreement_id)
    total_payments = ledger_service.get_total_payments(db, agreement_id)
    net_adjustments = ledger_service.get_net_adjustments(db, agreement_id)
    deposit_received = ledger_service.get_deposit_received(db, agreement_id)
    deposit_applied = ledger_service.get_deposit_applied(db, agreement_id)
    deposit_returned = ledger_service.get_deposit_returned(db, agreement_id)
    deposit_held = max(Decimal("0"), deposit_received - deposit_applied - deposit_returned)
    # total_charges is already net of adjustments. Keeping the invariant here
    # prevents API consumers from having to know which ledger rows to add back.
    balance_due = max(Decimal("0"), total_charges - total_payments - deposit_applied)
    return {
        "total_charges": total_charges,
        "total_payments": total_payments,
        "net_adjustments": net_adjustments,
        "deposit_received": deposit_received,
        "deposit_applied": deposit_applied,
        "deposit_returned": deposit_returned,
        "deposit_held": deposit_held,
        "balance_due": balance_due,
    }


def get_balance_breakdown(db: Session, agreement_id: int) -> dict:
    """Public accessor for the shared balance breakdown.

    Exposed so routers compute these figures one way. The ledger balance
    endpoint previously had its own copy that omitted adjustments.
    """
    return _calculate_balance_breakdown(db, agreement_id)


def _get_balance_due_before_deposit(db: Session, agreement_id: int) -> Decimal:
    """Outstanding balance before applying held deposit."""
    breakdown = _calculate_balance_breakdown(db, agreement_id)
    # Balance owed excluding any held deposit offset
    return max(Decimal("0"), breakdown["total_charges"] - breakdown["total_payments"])


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
    
    # Lock last row so concurrent requests can't generate duplicate numbers
    last = (
        db.query(Agreement)
        .filter(Agreement.agreement_number.like(f"{prefix}%"))
        .order_by(Agreement.agreement_number.desc())
        .with_for_update()
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
    pickup_mileage: int | None = None,
    mileage_limit_per_day: int | None = None,
    excess_mileage_rate: Decimal | None = None,
    fuel_level_out: int | None = None,
    fuel_charge_rate: Decimal | None = None,
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
    
    # Validate vehicle — lock row to prevent double-booking under concurrent requests
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).with_for_update().first()
    if not vehicle or not vehicle.is_active:
        raise NotFoundError("Vehicle", vehicle_id)
    
    # A "with driver" agreement without a driver is not a valid record. The
    # UI can silently omit the field, so refuse it here rather than storing an
    # agreement whose type and contents disagree.
    if agreement_type == AgreementType.CUSTOMER_VEHICLE_DRIVER and not driver_id:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "A driver is required for a with-driver agreement",
        )

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
    now = _now_matching_input(pickup_datetime)
    pickup_datetime = _ensure_utc(pickup_datetime)
    expected_return_datetime = _ensure_utc(expected_return_datetime)
    if pickup_datetime <= now:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "Pickup date must be in the future",
        )
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
    
    # Generate agreement number — also lock last row to prevent duplicate numbers
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
        pickup_mileage=pickup_mileage,
        mileage_limit_per_day=mileage_limit_per_day,
        excess_mileage_rate=excess_mileage_rate,
        fuel_level_out=fuel_level_out,
        fuel_charge_rate=fuel_charge_rate,
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

    # Reserve the vehicle — only move to RENTED when the agreement is activated (handover done)
    vehicle.status = VehicleStatus.RESERVED

    # Calculate and post initial rental charge. The vehicle's weekly/monthly rates
    # are applied when they beat the daily price for this duration; when unset this
    # is exactly days x daily_rate.
    days, charge = billing_service.calculate_rental_charge(
        pickup_datetime,
        expected_return_datetime,
        daily_rate,
        weekly_rate=vehicle.weekly_rate,
        monthly_rate=vehicle.monthly_rate,
    )
    description = _rental_charge_description(days, daily_rate, charge)
    ledger_service.post_charge(
        db=db,
        agreement_id=agreement.id,
        amount=charge,
        description=description,
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
    fuel_level_in: int | None = None,
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

    now = _now_matching_input(actual_return_datetime)
    actual_return_datetime = _ensure_utc(actual_return_datetime)
    if actual_return_datetime < _ensure_utc(agreement.pickup_datetime):
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "Actual return date cannot be before pickup date",
        )
    if actual_return_datetime > now:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Actual return date cannot be in the future")
    expected_return_datetime = _ensure_utc(agreement.expected_return_datetime)
    
    # Calculate late fee if applicable
    if actual_return_datetime > expected_return_datetime:
        late_days = billing_service.calculate_rental_days(
            expected_return_datetime, actual_return_datetime
        )
        late_daily_rate = agreement.agreed_daily_rate * Decimal("1.5")
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
                description=(
                    f"Late return fee: {late_days} days × ETB "
                    f"{late_daily_rate:,.2f} (1.5× daily rate)"
                ),
                entry_type=LedgerEntryType.LATE_FEE,
                created_by_id=closed_by_id,
                auto_commit=False,  # Let close_agreement handle the commit
            )

    # Record the return fuel level before computing the shortfall.
    if fuel_level_in is not None:
        agreement.fuel_level_in = fuel_level_in

    # Excess mileage. Only charged when a policy was agreed and both odometer
    # readings exist; otherwise mileage is unlimited and nothing is posted.
    if (
        agreement.mileage_limit_per_day
        and agreement.excess_mileage_rate
        and return_mileage is not None
        and agreement.pickup_mileage is not None
    ):
        # The allowance follows the period the customer was billed for. An early
        # return must not shrink a two-day contracted allowance to one day; a late
        # return still expands it through the actual return time.
        allowance_end = max(expected_return_datetime, actual_return_datetime)
        rental_days = billing_service.calculate_rental_days(
            _ensure_utc(agreement.pickup_datetime), allowance_end
        )
        excess_km, mileage_charge = billing_service.calculate_mileage_charge(
            start_mileage=agreement.pickup_mileage,
            end_mileage=return_mileage,
            free_km_per_day=agreement.mileage_limit_per_day,
            rental_days=rental_days,
            excess_km_rate=agreement.excess_mileage_rate,
        )
        if mileage_charge > 0:
            ledger_service.post_charge(
                db=db,
                agreement_id=agreement_id,
                amount=mileage_charge,
                description=(
                    f"Excess mileage: {excess_km} km over "
                    f"{agreement.mileage_limit_per_day * rental_days} km allowance "
                    f"({rental_days} days × {agreement.mileage_limit_per_day} km/day)"
                ),
                entry_type=LedgerEntryType.CHARGE,
                created_by_id=closed_by_id,
                auto_commit=False,
            )

    # Fuel shortfall, charged per whole percent below the level at handover.
    if (
        agreement.fuel_charge_rate
        and agreement.fuel_level_out is not None
        and agreement.fuel_level_in is not None
    ):
        shortfall = agreement.fuel_level_out - agreement.fuel_level_in
        if shortfall > 0:
            fuel_charge = agreement.fuel_charge_rate * shortfall
            ledger_service.post_charge(
                db=db,
                agreement_id=agreement_id,
                amount=fuel_charge,
                description=(
                    f"Fuel shortfall: {shortfall}% "
                    f"(out {agreement.fuel_level_out}%, in {agreement.fuel_level_in}%)"
                ),
                entry_type=LedgerEntryType.CHARGE,
                created_by_id=closed_by_id,
                auto_commit=False,
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

    # Auto-return any remaining deposit that wasn't needed to cover charges
    remaining_held = ledger_service.get_deposit_held(db, agreement_id)
    if remaining_held > 0:
        ledger_service.return_deposit(
            db=db,
            agreement_id=agreement_id,
            amount=remaining_held,
            created_by_id=closed_by_id,
            notes="Deposit remainder automatically returned on close",
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
    
    # Update vehicle segments end mileage and release vehicle
    for segment in agreement.vehicle_segments:
        if return_mileage and not segment.end_mileage:
            segment.end_mileage = return_mileage

        vehicle = segment.vehicle
        if return_mileage:
            vehicle.current_mileage = return_mileage

        release_vehicle(db, vehicle, agreement_id)

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

    now = _now_matching_input(actual_return_datetime)
    actual_return_datetime = _ensure_utc(actual_return_datetime)
    if actual_return_datetime < _ensure_utc(agreement.pickup_datetime):
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "Actual return date cannot be before pickup date",
        )
    if actual_return_datetime > now:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Actual return date cannot be in the future")
    agreement.status = AgreementStatus.RETURNED
    agreement.actual_return_datetime = actual_return_datetime
    agreement.return_mileage = return_mileage
    if returned_by_id:
        agreement.closed_by_id = returned_by_id
    if notes:
        agreement.notes = (agreement.notes or "") + f"\n[Returned] {notes}"

    for segment in agreement.vehicle_segments:
        vehicle = segment.vehicle
        if return_mileage:
            segment.end_mileage = segment.end_mileage or return_mileage
            vehicle.current_mileage = return_mileage
        release_vehicle(db, vehicle, agreement_id)

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

    if agreement.status == AgreementStatus.ACTIVE:
        return agreement  # Already active — idempotent

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
    
    if agreement.status not in (AgreementStatus.ACTIVE, AgreementStatus.OVERDUE):
        raise BusinessError(
            ErrorCode.AGREEMENT_CANNOT_EXTEND,
            f"Cannot extend agreement with status {agreement.status.value}"
        )

    now = _now_matching_input(new_return_datetime)
    new_return_datetime = _ensure_utc(new_return_datetime)
    current_return_datetime = _ensure_utc(agreement.expected_return_datetime)
    if new_return_datetime <= current_return_datetime:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "New return date must be after current expected return date"
        )

    if new_return_datetime <= now:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "New return date must be in the future"
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
    # Once the return date is moved back into the future, the agreement is no
    # longer overdue. The vehicle remains rented throughout the extension.
    agreement.status = AgreementStatus.ACTIVE
    
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


def _find_blocking_agreement(
    db: Session, vehicle_id: int, agreement: Agreement
) -> Agreement | None:
    """The other agreement whose hold overlaps this one, if any."""
    return (
        db.query(Agreement)
        .join(AgreementVehicleSegment)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle_id,
            Agreement.id != agreement.id,
            Agreement.status.in_(
                [
                    AgreementStatus.PENDING_PAYMENT,
                    AgreementStatus.ACTIVE,
                    AgreementStatus.OVERDUE,
                ]
            ),
            AgreementVehicleSegment.start_datetime < agreement.expected_return_datetime,
            AgreementVehicleSegment.end_datetime > agreement.pickup_datetime,
        )
        .order_by(AgreementVehicleSegment.start_datetime)
        .first()
    )


def _notify_customer_of_approval(
    db: Session, agreement: Agreement, charge: Decimal
) -> None:
    """Send the approval message, never letting it break the approval."""
    from src.services.telegram_bot_service import telegram_bot_service

    deposit = ""
    if agreement.deposit_amount and agreement.deposit_amount > 0:
        deposit = f"\nDeposit at pickup: {agreement.deposit_amount:,.2f} ETB"

    telegram_bot_service.notify_customer_soon(
        db,
        agreement.customer_id,
        f"Your booking is confirmed.\n\n"
        f"{agreement.agreement_number}\n"
        f"Pickup: {agreement.pickup_datetime:%d %b %Y %H:%M}\n"
        f"Return: {agreement.expected_return_datetime:%d %b %Y %H:%M}\n"
        f"Total: {charge:,.2f} ETB{deposit}\n\n"
        f"Use /mybookings to see the details.",
    )


def _rental_charge_description(
    days: int, daily_rate: Decimal, charge: Decimal
) -> str:
    """Describe a rental charge in terms that match its amount.

    The approval path described every charge as "N days @ rate/day" even when
    a tier had been applied, so the ledger read "7 days @ 1100.00/day" beside
    a debit of 6,500 — 7 x 1,100 is 7,700, and to anyone auditing the ledger
    that looks like an arithmetic error rather than the weekly rate.
    """
    flat = daily_rate * days
    if charge < flat:
        return (
            f"Rental charge: {days} days — tiered rate {charge} "
            f"(saved {flat - charge} against {daily_rate}/day)"
        )
    return f"Rental charge: {days} days @ {daily_rate}/day"


def _reverse_outstanding_charges_on_cancel(
    db: Session,
    agreement: Agreement,
    cancelled_by_id: int | None,
) -> None:
    """Clear charges for a cancelled booking nobody has paid against.

    An approved booking carries a posted rental charge. Cancelling it used to
    change the status and release the vehicle while leaving that charge
    standing, so the customer kept seeing a balance due on a rental that will
    never happen and staff had no Reverse action on the row to clear it.

    Only when nothing has been paid. Once money has changed hands the charge
    is half of a record -- what was owed against what was received -- and
    reversing it would turn a refund into a silent write-off. That is a
    decision for staff, who can reverse entries individually.

    A cancellation fee, if the business wants one, belongs here as its own
    charge rather than as the untouched remains of the rental charge.
    """
    from src.services import ledger_service

    if ledger_service.get_total_payments(db, agreement.id) > 0:
        return

    reversible = (
        LedgerEntryType.CHARGE,
        LedgerEntryType.LATE_FEE,
        LedgerEntryType.DAMAGE_CHARGE,
        LedgerEntryType.ADJUSTMENT,
    )
    already_reversed = {
        row.reversed_entry_id
        for row in db.query(LedgerEntry)
        .filter(
            LedgerEntry.agreement_id == agreement.id,
            LedgerEntry.reversed_entry_id.isnot(None),
        )
        .all()
    }

    entries = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.agreement_id == agreement.id,
            LedgerEntry.entry_type.in_(reversible),
        )
        .all()
    )
    for entry in entries:
        if entry.id in already_reversed or entry.amount == 0:
            continue
        db.add(
            LedgerEntry(
                agreement_id=agreement.id,
                entry_type=LedgerEntryType.REVERSAL,
                amount=-entry.amount,
                description=(
                    f"Reversal of entry #{entry.id}: booking cancelled before payment"
                ),
                reversed_entry_id=entry.id,
                created_by_id=cancelled_by_id,
            )
        )
    db.flush()


def cancel_agreement(
    db: Session,
    agreement_id: int,
    cancelled_by_id: int | None = None,
    reason: str | None = None,
) -> Agreement:
    """Cancel an agreement and release only its own vehicle holds."""
    from sqlalchemy.orm import joinedload

    agreement = (
        db.query(Agreement)
        .options(joinedload(Agreement.vehicle_segments).joinedload(AgreementVehicleSegment.vehicle))
        .filter(Agreement.id == agreement_id)
        .first()
    )
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)

    if agreement.status not in (
        AgreementStatus.BOOKING_REQUESTED,
        AgreementStatus.DRAFT,
        AgreementStatus.PENDING_PAYMENT,
    ):
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Cannot cancel agreement with status {agreement.status.value}.",
        )

    was_booking_request = agreement.status == AgreementStatus.BOOKING_REQUESTED
    agreement.status = AgreementStatus.CANCELLED
    if reason:
        agreement.notes = (agreement.notes or "") + f"\n[Cancelled] {reason}"

    # Only release the vehicle if it was actually locked (BOOKING_REQUESTED never locks)
    if not was_booking_request:
        for segment in agreement.vehicle_segments:
            release_vehicle(db, segment.vehicle, agreement_id)

    _reverse_outstanding_charges_on_cancel(db, agreement, cancelled_by_id)

    db.commit()
    db.refresh(agreement)

    logger.info(f"Cancelled agreement {agreement.agreement_number}")
    return agreement


def approve_booking_request(
    db: Session,
    agreement_id: int,
    approved_by_id: int | None = None,
    deposit_amount: Decimal | None = None,
    advance_payment: Decimal | None = None,
    pickup_mileage: int | None = None,
    mileage_limit_per_day: int | None = None,
    excess_mileage_rate: Decimal | None = None,
    fuel_level_out: int | None = None,
    fuel_charge_rate: Decimal | None = None,
) -> Agreement:
    """Approve a customer booking request: check availability, lock vehicle, post rental charge."""
    from sqlalchemy.orm import joinedload

    agreement = (
        db.query(Agreement)
        .options(joinedload(Agreement.vehicle_segments).joinedload(AgreementVehicleSegment.vehicle))
        .filter(Agreement.id == agreement_id)
        .first()
    )
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)

    if agreement.status != AgreementStatus.BOOKING_REQUESTED:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Cannot approve an agreement with status '{agreement.status.value}'",
        )

    # Staff confirms these contract terms while reviewing a public request.
    # Values omitted by older clients preserve the existing defaults.
    terms = {
        "deposit_amount": deposit_amount,
        "advance_payment": advance_payment,
        "pickup_mileage": pickup_mileage,
        "mileage_limit_per_day": mileage_limit_per_day,
        "excess_mileage_rate": excess_mileage_rate,
        "fuel_level_out": fuel_level_out,
        "fuel_charge_rate": fuel_charge_rate,
    }
    for field, value in terms.items():
        if value is not None:
            setattr(agreement, field, value)

    for segment in agreement.vehicle_segments:
        vehicle = db.query(Vehicle).filter(Vehicle.id == segment.vehicle_id).with_for_update().first()
        if not vehicle or not vehicle.is_active:
            raise NotFoundError("Vehicle", segment.vehicle_id)

        # Exclude this agreement's own segments from the overlap check, but still
        # enforce the vehicle status gate — the booking does not hold the vehicle yet.
        if not availability_repository.check_vehicle_available(
            db, vehicle.id, agreement.pickup_datetime, agreement.expected_return_datetime,
            exclude_agreement_id=agreement.id,
            # Another pending request is not a hold: counting it as one meant
            # two overlapping requests deadlocked, neither approvable.
            holds_only=True,
        ):
            # Name the blocker. Competing requests for one car is the normal
            # case this flow exists to resolve, and staff previously hit a
            # wall with no way to tell what was in the way.
            blocker = _find_blocking_agreement(db, vehicle.id, agreement)
            detail = (
                f" Blocked by {blocker.agreement_number} "
                f"({blocker.pickup_datetime:%d %b} to "
                f"{blocker.expected_return_datetime:%d %b}, "
                f"{blocker.status.value.replace('_', ' ')})."
                if blocker
                else ""
            )
            raise BusinessError(
                ErrorCode.VEHICLE_NOT_AVAILABLE,
                f"Vehicle {vehicle.plate_number} is no longer available for the "
                f"requested dates.{detail}",
            )

        vehicle.status = VehicleStatus.RESERVED

    # Post the initial rental charge now that we're committing the booking.
    # Tier rates come from the first booked vehicle, matching how the quote was shown.
    first_vehicle = agreement.vehicle_segments[0].vehicle if agreement.vehicle_segments else None
    days, charge = billing_service.calculate_rental_charge(
        agreement.pickup_datetime,
        agreement.expected_return_datetime,
        agreement.agreed_daily_rate,
        weekly_rate=first_vehicle.weekly_rate if first_vehicle else None,
        monthly_rate=first_vehicle.monthly_rate if first_vehicle else None,
    )
    ledger_service.post_charge(
        db=db,
        agreement_id=agreement.id,
        amount=charge,
        description=_rental_charge_description(
            days, agreement.agreed_daily_rate, charge
        ),
        entry_type=LedgerEntryType.CHARGE,
        created_by_id=approved_by_id,
    )

    agreement.status = AgreementStatus.PENDING_PAYMENT
    db.commit()
    db.refresh(agreement)

    # Tell the customer. Until now they had to keep opening the site or
    # /mybookings to discover their request had been accepted -- which is
    # exactly the kind of thing a bot exists to save them.
    _notify_customer_of_approval(db, agreement, charge)

    logger.info(f"Approved booking request {agreement.agreement_number}")
    return agreement


def get_agreement_summary(db: Session, agreement_id: int) -> dict[str, Any]:
    """Get agreement details with balance summary."""
    agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
    if not agreement:
        raise NotFoundError("Agreement", agreement_id)

    breakdown = _calculate_balance_breakdown(db, agreement_id)
    entries = ledger_service.get_ledger_entries(db, agreement_id)

    return {
        "agreement": agreement,
        "ledger_entries": entries,
        **breakdown,
        "balance": breakdown["balance_due"],
    }
