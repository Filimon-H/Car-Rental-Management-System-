"""Customer model."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.agreement import Agreement
    from src.models.customer_document import CustomerDocument


class Customer(Base):
    """Customer model for rental agreements."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Business type: individual, company, government, embassy, ngo, church
    business_type: Mapped[str] = mapped_column(String(50), nullable=False, default="individual")
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Required if not individual
    tin_number: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Tax ID
    
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    phone_primary: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    phone_secondary: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # ID document - only required for individual customers
    id_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # passport, national_id, kebele_id
    id_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    id_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Driver license - only required for individual customers
    license_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    license_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Address - Ethiopian format
    house_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    wereda: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subcity: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Bole, Lideta, Yeka, etc.
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Emergency contact
    emergency_contact_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    agreements: Mapped[list["Agreement"]] = relationship(
        "Agreement", back_populates="customer", lazy="dynamic"
    )
    collateral_persons: Mapped[list["CollateralPerson"]] = relationship(
        "CollateralPerson", back_populates="customer", lazy="dynamic"
    )
    documents: Mapped[list["CustomerDocument"]] = relationship(
        "CustomerDocument", back_populates="customer", lazy="dynamic", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        """Return full name combining first and last name."""
        return f"{self.first_name} {self.last_name}"

    def __repr__(self) -> str:
        return f"<Customer(id={self.id}, name={self.full_name}, phone={self.phone_primary})>"
