"""Vehicle model."""

from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.agreement_vehicle_segment import AgreementVehicleSegment
    from src.models.vendor import Vendor


class VehicleStatus(str, PyEnum):
    """Vehicle status enumeration."""

    AVAILABLE = "available"
    RESERVED = "reserved"
    RENTED = "rented"
    MAINTENANCE = "maintenance"
    INACTIVE = "inactive"


class VehicleType(str, PyEnum):
    """Compatibility enum for common vehicle type values."""

    SEDAN = "sedan"
    SUV = "suv"
    HATCHBACK = "hatchback"
    VAN = "van"
    PICKUP = "pickup"
    BUS = "bus"
    TRUCK = "truck"
    OTHER = "other"


class Vehicle(Base):
    """Vehicle model for fleet management."""

    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Vendor relationship - every vehicle belongs to a vendor
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), nullable=False, index=True)
    
    # Plate info
    plate_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    plate_code: Mapped[str] = mapped_column(String(20), nullable=False)  # 01, 02, 03, 05, Daily, Temporary, Other
    plate_city: Mapped[str | None] = mapped_column(String(50), nullable=True)  # AA, OR, etc.
    
    # Vehicle info
    make: Mapped[str] = mapped_column(String(50), nullable=False)  # Toyota, Suzuki, etc.
    model: Mapped[str] = mapped_column(String(50), nullable=False)  # Vitz, Corolla, Dezire, etc.
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str] = mapped_column(String(30), nullable=False)  # Black, White, Red, etc.
    vehicle_type: Mapped[str] = mapped_column(String(30), nullable=False)  # Standard, Compact, Sportcar, etc.
    service_type: Mapped[str] = mapped_column(String(30), nullable=False)  # Business, Field Work, Wedding, etc.
    car_condition: Mapped[str] = mapped_column(String(30), default="good", nullable=False)  # Excellent, Very Good, Good, Not Good, Risky
    
    # Identification
    motor_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    chassis_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # Capacity
    seats: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(20), default="petrol", nullable=False)  # Petrol, Diesel, Hybrid, Electric, Other
    transmission: Mapped[str] = mapped_column(String(20), default="automatic", nullable=False)
    
    # Status and tracking
    status: Mapped[VehicleStatus] = mapped_column(
        Enum(VehicleStatus), default=VehicleStatus.AVAILABLE, nullable=False, index=True
    )
    current_mileage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Pricing (daily rate in ETB)
    daily_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    # Insurance
    insurance_policy: Mapped[str | None] = mapped_column(String(100), nullable=True)
    insurance_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Photos (relative paths)
    photo_front: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_back: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_left: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_right: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_interior: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="vehicles", lazy="joined")
    agreement_segments: Mapped[list["AgreementVehicleSegment"]] = relationship(
        "AgreementVehicleSegment", back_populates="vehicle", lazy="dynamic"
    )

    def __repr__(self) -> str:
        return f"<Vehicle(id={self.id}, plate={self.plate_number}, status={self.status})>"
