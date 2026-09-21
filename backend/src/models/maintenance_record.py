"""MaintenanceRecord model for vehicle service history."""

from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.vehicle import Vehicle


class MaintenanceType(str, PyEnum):
    """Kind of work performed."""

    ROUTINE_SERVICE = "routine_service"
    OIL_CHANGE = "oil_change"
    TIRE_REPLACEMENT = "tire_replacement"
    BRAKE_SERVICE = "brake_service"
    REPAIR = "repair"
    BODYWORK = "bodywork"
    INSPECTION = "inspection"
    OTHER = "other"


class MaintenanceRecord(Base):
    """A single service event on a vehicle, with optional next-due tracking.

    Next-due can be expressed by date, by odometer reading, or both; whichever
    arrives first makes the vehicle due. This mirrors how insurance expiry is
    already surfaced, so overdue servicing shows up in the same dashboard.
    """

    __tablename__ = "maintenance_records"

    __table_args__ = (
        CheckConstraint("cost >= 0", name="ck_maintenance_cost_non_negative"),
        CheckConstraint("odometer >= 0", name="ck_maintenance_odometer_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    vehicle_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vehicles.id"), nullable=False, index=True
    )

    service_type: Mapped[MaintenanceType] = mapped_column(
        Enum(MaintenanceType), nullable=False, index=True
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    odometer: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Next service due — by date, by mileage, or both.
    next_due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    next_due_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="maintenance_records")

    def __repr__(self) -> str:
        return (
            f"<MaintenanceRecord(id={self.id}, vehicle={self.vehicle_id}, "
            f"type={self.service_type}, at={self.performed_at})>"
        )
