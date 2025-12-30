"""Lookup table model for dynamic dropdown values."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.core.db import Base


class LookupValue(Base):
    """
    Lookup table for dynamic dropdown values.
    Admins can add/edit/delete values for: car_model, color, vehicle_type, service_type, etc.
    """

    __tablename__ = "lookup_values"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Category: car_model, color, vehicle_type, service_type, plate_code, fuel_type, car_condition
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # The actual value
    value: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Display label (optional, defaults to value)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Sort order for display
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Whether this value is active
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<LookupValue({self.category}: {self.value})>"
