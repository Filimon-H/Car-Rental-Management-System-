"""Driver model for storing driver information."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base


class Driver(Base):
    """Driver model - stores information about drivers available for rental agreements."""

    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Personal info
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    phone_primary: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    phone_secondary: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # ID document
    id_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # passport, national_id, kebele_id
    id_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    
    # Driver license (required for drivers)
    license_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    license_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    license_class: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g., Class 1, 2, 3, etc.
    
    # Address - Ethiopian format
    house_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    wereda: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subcity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Emergency contact
    emergency_contact_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
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

    @property
    def full_name(self) -> str:
        """Return full name."""
        return f"{self.first_name} {self.last_name}"

    def __repr__(self) -> str:
        return f"<Driver {self.id}: {self.full_name}>"
