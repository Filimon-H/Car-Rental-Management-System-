"""CollateralPerson model for storing collateral/guarantor information linked to customers."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base


class CollateralPerson(Base):
    """CollateralPerson model - stores guarantor information linked to a customer."""

    __tablename__ = "collateral_persons"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Link to customer (required)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    
    # Personal info
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    phone_primary: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    phone_secondary: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Relationship to customer
    relationship_to_customer: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., parent, spouse, friend, employer
    
    # ID document
    id_type: Mapped[str] = mapped_column(String(50), nullable=False)  # passport, national_id, kebele_id
    id_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # Address - Ethiopian format
    house_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    wereda: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subcity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Occupation/Work info
    occupation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    employer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    employer_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
    # Status and notes
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    customer = relationship("Customer", back_populates="collateral_persons")

    @property
    def full_name(self) -> str:
        """Return full name."""
        return f"{self.first_name} {self.last_name}"

    def __repr__(self) -> str:
        return f"<CollateralPerson {self.id}: {self.full_name} for Customer {self.customer_id}>"
