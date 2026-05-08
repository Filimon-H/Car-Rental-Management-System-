"""LedgerEntry model for financial tracking."""

from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.agreement import Agreement


class LedgerEntryType(str, PyEnum):
    """Types of ledger entries."""

    CHARGE = "charge"           # Rental charges, fees
    PAYMENT = "payment"         # Customer payments
    DEPOSIT = "deposit"         # Security deposit
    DEPOSIT_APPLIED = "deposit_applied"  # Deposit applied to charges (deducted)
    DEPOSIT_RETURN = "deposit_return"  # Deposit returned
    ADJUSTMENT = "adjustment"   # Manual adjustments
    REVERSAL = "reversal"       # Reversal of previous entry
    DAMAGE_CHARGE = "damage_charge"  # Damage fees
    LATE_FEE = "late_fee"       # Late return fee


class PaymentMethod(str, PyEnum):
    """Payment methods."""

    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    TELEBIRR = "telebirr"
    CBE_BIRR = "cbe_birr"
    CHECK = "check"
    OTHER = "other"


class LedgerEntry(Base):
    """Append-only ledger entry for financial audit trail.
    
    Key invariants:
    - Entries are NEVER deleted or modified
    - Corrections are made via reversal entries
    - Balance = sum of all entries for an agreement
    """

    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    agreement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agreements.id"), nullable=False, index=True
    )
    
    entry_type: Mapped[LedgerEntryType] = mapped_column(
        Enum(LedgerEntryType), nullable=False, index=True
    )
    
    # Amount: positive = customer owes, negative = credit to customer
    # For payments: negative (reduces balance)
    # For charges: positive (increases balance)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    # Payment details (only for payment entries)
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod), nullable=True
    )
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Description
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # For reversals, link to the reversed entry
    reversed_entry_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("ledger_entries.id"), nullable=True
    )
    
    # Audit
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Relationships
    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="ledger_entries")

    def __repr__(self) -> str:
        return f"<LedgerEntry(id={self.id}, type={self.entry_type}, amount={self.amount})>"
