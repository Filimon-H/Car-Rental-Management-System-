"""CollateralDocument model for storing collateral ID documents."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base
from src.models.customer_document import DocumentType

if TYPE_CHECKING:
    from src.models.collateral_person import CollateralPerson


class CollateralDocument(Base):
    """Collateral document model for storing uploaded ID images."""

    __tablename__ = "collateral_documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    collateral_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collateral_persons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), nullable=False)

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    uploaded_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff_users.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    collateral: Mapped["CollateralPerson"] = relationship(
        "CollateralPerson", back_populates="documents"
    )

    def __repr__(self) -> str:
        return f"<CollateralDocument(id={self.id}, collateral_id={self.collateral_id}, type={self.doc_type})>"
