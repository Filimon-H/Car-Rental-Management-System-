"""CustomerDocument model for storing customer ID and license documents."""

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base

if TYPE_CHECKING:
    from src.models.customer import Customer


class DocumentType(str, PyEnum):
    """Document type enumeration."""
    
    PASSPORT = "passport"
    NATIONAL_ID = "national_id"
    KEBELE_ID = "kebele_id"
    DRIVER_LICENSE = "driver_license"


class CustomerDocument(Base):
    """Customer document model for storing uploaded ID and license images."""

    __tablename__ = "customer_documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    
    doc_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType), nullable=False
    )
    
    # File storage
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)  # bytes
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Audit
    uploaded_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="documents")

    def __repr__(self) -> str:
        return f"<CustomerDocument(id={self.id}, customer_id={self.customer_id}, type={self.doc_type})>"
