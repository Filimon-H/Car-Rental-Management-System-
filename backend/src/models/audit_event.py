"""AuditEvent model for tracking all important actions."""

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.staff_user import StaffUser


class AuditAction(str, PyEnum):
    """Types of auditable actions."""

    # Auth
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"

    # User management
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DEACTIVATED = "user_deactivated"

    # Customer/Vendor
    CUSTOMER_CREATED = "customer_created"
    CUSTOMER_UPDATED = "customer_updated"
    VENDOR_CREATED = "vendor_created"
    VENDOR_UPDATED = "vendor_updated"

    # Vehicle
    VEHICLE_CREATED = "vehicle_created"
    VEHICLE_UPDATED = "vehicle_updated"
    VEHICLE_STATUS_CHANGED = "vehicle_status_changed"

    # Agreement
    AGREEMENT_CREATED = "agreement_created"
    AGREEMENT_UPDATED = "agreement_updated"
    AGREEMENT_EXTENDED = "agreement_extended"
    AGREEMENT_CLOSED = "agreement_closed"
    AGREEMENT_CANCELLED = "agreement_cancelled"

    # Financial
    PAYMENT_POSTED = "payment_posted"
    ADJUSTMENT_POSTED = "adjustment_posted"
    CHARGE_POSTED = "charge_posted"

    # Inspection
    INSPECTION_CREATED = "inspection_created"
    INSPECTION_COMPLETED = "inspection_completed"

    # Booking
    BOOKING_CREATED = "booking_created"
    BOOKING_CONVERTED = "booking_converted"
    BOOKING_CANCELLED = "booking_cancelled"

    # Documents
    DOCUMENT_GENERATED = "document_generated"


class AuditEvent(Base):
    """Audit event for tracking all important actions with attribution."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True, index=True
    )
    action: Mapped[AuditAction] = mapped_column(Enum(AuditAction), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Relationships
    actor: Mapped["StaffUser | None"] = relationship("StaffUser", back_populates="audit_events")

    def __repr__(self) -> str:
        return f"<AuditEvent(id={self.id}, action={self.action}, entity={self.entity_type}:{self.entity_id})>"
