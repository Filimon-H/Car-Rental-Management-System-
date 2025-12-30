"""Agreement model."""

from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.customer import Customer
    from src.models.agreement_vehicle_segment import AgreementVehicleSegment
    from src.models.ledger_entry import LedgerEntry
    from src.models.driver import Driver
    from src.models.collateral_person import CollateralPerson


class AgreementType(str, PyEnum):
    """Agreement type enumeration."""

    CUSTOMER_VEHICLE = "customer_vehicle"  # Customer <-> NOD (standard rental)
    CUSTOMER_VEHICLE_DRIVER = "customer_vehicle_driver"  # Customer <-> NOD + Driver
    VENDOR_VEHICLE = "vendor_vehicle"  # Vendor <-> NOD (vendor supplies vehicle)
    # Legacy types for backward compatibility
    STANDARD = "standard"
    WEDDING = "wedding"
    VENDOR_WEDDING = "vendor_wedding"


class AgreementStatus(str, PyEnum):
    """Agreement status enumeration."""

    DRAFT = "draft"
    ACTIVE = "active"
    CLOSED = "closed"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class Agreement(Base):
    """Agreement model for rental contracts."""

    __tablename__ = "agreements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agreement_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    
    agreement_type: Mapped[AgreementType] = mapped_column(
        Enum(AgreementType), default=AgreementType.STANDARD, nullable=False
    )
    status: Mapped[AgreementStatus] = mapped_column(
        Enum(AgreementStatus), default=AgreementStatus.DRAFT, nullable=False, index=True
    )
    
    # Customer
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("customers.id"), nullable=False, index=True
    )
    
    # Driver (optional - for agreements with driver)
    driver_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("drivers.id"), nullable=True, index=True
    )
    
    # Collateral Person (required for customer agreements)
    collateral_person_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("collateral_persons.id"), nullable=True, index=True
    )
    
    # Dates (all in UTC)
    pickup_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expected_return_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actual_return_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Pricing
    agreed_daily_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), nullable=False)
    advance_payment: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # Optional advance payment
    
    # Pickup/return location
    pickup_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    return_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Mileage tracking
    pickup_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    return_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Additional info
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    special_terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Audit
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )
    closed_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="agreements")
    driver: Mapped["Driver | None"] = relationship("Driver", lazy="joined")
    collateral_person: Mapped["CollateralPerson | None"] = relationship("CollateralPerson", lazy="joined")
    vehicle_segments: Mapped[list["AgreementVehicleSegment"]] = relationship(
        "AgreementVehicleSegment", back_populates="agreement", lazy="selectin"
    )
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(
        "LedgerEntry", back_populates="agreement", lazy="dynamic"
    )
    inspections: Mapped[list["Inspection"]] = relationship(
        "Inspection", back_populates="agreement", lazy="dynamic"
    )

    def __repr__(self) -> str:
        return f"<Agreement(id={self.id}, number={self.agreement_number}, status={self.status})>"
