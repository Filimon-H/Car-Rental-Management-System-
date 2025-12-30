"""Ledger service for append-only financial operations."""

from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.core.errors import BusinessError, ErrorCode
from src.core.logging import get_logger
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod

logger = get_logger(__name__)


def get_agreement_balance(db: Session, agreement_id: int) -> Decimal:
    """Get current balance for an agreement.
    
    Balance = sum of all ledger entries
    Positive = customer owes money
    Negative = credit to customer
    """
    result = (
        db.query(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .filter(LedgerEntry.agreement_id == agreement_id)
        .scalar()
    )
    return Decimal(str(result))


def post_charge(
    db: Session,
    agreement_id: int,
    amount: Decimal,
    description: str,
    entry_type: LedgerEntryType = LedgerEntryType.CHARGE,
    created_by_id: int | None = None,
    notes: str | None = None,
) -> LedgerEntry:
    """Post a charge to the agreement ledger.
    
    Charges increase the balance (customer owes more).
    """
    if amount <= 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Charge amount must be positive")
    
    entry = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=entry_type,
        amount=amount,  # Positive = customer owes
        description=description,
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    logger.info(f"Posted charge: {entry_type.value} {amount} to agreement {agreement_id}")
    return entry


def post_payment(
    db: Session,
    agreement_id: int,
    amount: Decimal,
    payment_method: PaymentMethod,
    description: str = "Payment received",
    payment_reference: str | None = None,
    created_by_id: int | None = None,
    notes: str | None = None,
) -> LedgerEntry:
    """Post a payment to the agreement ledger.
    
    Payments decrease the balance (reduce what customer owes).
    """
    if amount <= 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Payment amount must be positive")
    
    entry = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=LedgerEntryType.PAYMENT,
        amount=-amount,  # Negative = reduces balance
        description=description,
        payment_method=payment_method,
        payment_reference=payment_reference,
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    logger.info(f"Posted payment: {amount} via {payment_method.value} to agreement {agreement_id}")
    return entry


def post_deposit(
    db: Session,
    agreement_id: int,
    amount: Decimal,
    payment_method: PaymentMethod,
    created_by_id: int | None = None,
) -> LedgerEntry:
    """Post a security deposit."""
    if amount <= 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Deposit amount must be positive")
    
    entry = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=LedgerEntryType.DEPOSIT,
        amount=-amount,  # Negative = credit (held)
        description="Security deposit received",
        payment_method=payment_method,
        created_by_id=created_by_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    logger.info(f"Posted deposit: {amount} to agreement {agreement_id}")
    return entry


def return_deposit(
    db: Session,
    agreement_id: int,
    amount: Decimal,
    created_by_id: int | None = None,
    notes: str | None = None,
) -> LedgerEntry:
    """Return security deposit (or partial)."""
    if amount <= 0:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Return amount must be positive")
    
    entry = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=LedgerEntryType.DEPOSIT_RETURN,
        amount=amount,  # Positive = charge back (deposit returned)
        description="Security deposit returned",
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    logger.info(f"Returned deposit: {amount} from agreement {agreement_id}")
    return entry


def post_adjustment(
    db: Session,
    agreement_id: int,
    amount: Decimal,
    description: str,
    created_by_id: int | None = None,
    notes: str | None = None,
) -> LedgerEntry:
    """Post a manual adjustment.
    
    Positive amount = increases balance (charge)
    Negative amount = decreases balance (credit)
    """
    entry = LedgerEntry(
        agreement_id=agreement_id,
        entry_type=LedgerEntryType.ADJUSTMENT,
        amount=amount,
        description=description,
        notes=notes,
        created_by_id=created_by_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    logger.info(f"Posted adjustment: {amount} to agreement {agreement_id}")
    return entry


def reverse_entry(
    db: Session,
    entry_id: int,
    reason: str,
    created_by_id: int | None = None,
) -> LedgerEntry:
    """Reverse a previous ledger entry."""
    original = db.query(LedgerEntry).filter(LedgerEntry.id == entry_id).first()
    if not original:
        raise BusinessError(ErrorCode.RESOURCE_NOT_FOUND, f"Ledger entry {entry_id} not found")
    
    # Check not already reversed
    existing_reversal = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.reversed_entry_id == entry_id)
        .first()
    )
    if existing_reversal:
        raise BusinessError(ErrorCode.RESOURCE_CONFLICT, "Entry already reversed")
    
    reversal = LedgerEntry(
        agreement_id=original.agreement_id,
        entry_type=LedgerEntryType.REVERSAL,
        amount=-original.amount,  # Opposite of original
        description=f"Reversal of entry #{entry_id}: {reason}",
        reversed_entry_id=entry_id,
        created_by_id=created_by_id,
    )
    db.add(reversal)
    db.commit()
    db.refresh(reversal)
    
    logger.info(f"Reversed entry {entry_id}: {reason}")
    return reversal


def get_ledger_entries(
    db: Session,
    agreement_id: int,
) -> list[LedgerEntry]:
    """Get all ledger entries for an agreement, ordered by date."""
    return (
        db.query(LedgerEntry)
        .filter(LedgerEntry.agreement_id == agreement_id)
        .order_by(LedgerEntry.created_at)
        .all()
    )


def get_total_charges(db: Session, agreement_id: int) -> Decimal:
    """Get total charges (positive amounts) for an agreement."""
    from sqlalchemy import func
    result = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.agreement_id == agreement_id)
        .filter(LedgerEntry.amount > 0)
        .scalar()
    )
    return Decimal(str(result)) if result else Decimal("0")


def get_total_payments(db: Session, agreement_id: int) -> Decimal:
    """Get total payments (negative amounts, returned as positive) for an agreement."""
    from sqlalchemy import func
    result = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.agreement_id == agreement_id)
        .filter(LedgerEntry.amount < 0)
        .scalar()
    )
    return abs(Decimal(str(result))) if result else Decimal("0")
