"""Vendor payment model for supplier settlement tracking."""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base
from src.models.ledger_entry import PaymentMethod

if TYPE_CHECKING:
    from src.models.agreement import Agreement
    from src.models.vendor import Vendor


class VendorPayment(Base):
    """Payment made by the business to an external vehicle vendor."""

    __tablename__ = "vendor_payments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vendors.id"), nullable=False, index=True
    )
    agreement_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("agreements.id"), nullable=True, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), nullable=False)
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="payments")
    agreement: Mapped["Agreement | None"] = relationship("Agreement", lazy="joined")

    def __repr__(self) -> str:
        return f"<VendorPayment(id={self.id}, vendor_id={self.vendor_id}, amount={self.amount})>"
