"""CustomerUser model for public customer authentication."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.db import Base, UtcDateTime

if TYPE_CHECKING:
    from src.models.customer import Customer
    from src.models.telegram import TelegramCustomerLink, TelegramCustomerLinkCode


class CustomerUser(Base):
    """Public-facing customer account linked to a Customer record."""

    __tablename__ = "customer_users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("customers.id"), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime(), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime(), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="customer_user")
    telegram_link: Mapped["TelegramCustomerLink | None"] = relationship(
        "TelegramCustomerLink",
        back_populates="customer_user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    telegram_link_codes: Mapped[list["TelegramCustomerLinkCode"]] = relationship(
        "TelegramCustomerLinkCode",
        back_populates="customer_user",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CustomerUser(id={self.id}, email={self.email})>"
