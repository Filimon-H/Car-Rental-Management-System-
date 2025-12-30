"""AgreementVehicleSegment model for tracking vehicles in agreements."""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.agreement import Agreement
    from src.models.vehicle import Vehicle


class AgreementVehicleSegment(Base):
    """Segment linking vehicles to agreements with date ranges.
    
    Supports:
    - Multiple vehicles per agreement
    - Vehicle swaps during rental
    - Date-range tracking for availability checks
    """

    __tablename__ = "agreement_vehicle_segments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    agreement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vehicles.id"), nullable=False, index=True
    )
    
    # Segment date range (for vehicle availability blocking)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    
    # Rate for this segment (may differ from agreement rate for swaps)
    daily_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    # Mileage at segment boundaries
    start_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="vehicle_segments")
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="agreement_segments")

    def __repr__(self) -> str:
        return f"<AgreementVehicleSegment(agreement={self.agreement_id}, vehicle={self.vehicle_id})>"
