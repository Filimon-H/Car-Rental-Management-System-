"""Vendor model for wedding car suppliers."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func
from sqlalchemy.orm import relationship

from src.core.db import Base


class Vendor(Base):
    """Vendor model for external car suppliers (wedding rentals)."""

    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    
    # Vendor type: individual or company
    vendor_type = Column(String(20), nullable=False, default="company")  # individual, company
    
    # Business info
    company_name = Column(String(200), nullable=True, index=True)  # Required only if vendor_type is company
    contact_person = Column(String(100), nullable=True)
    
    # Contact details
    phone_primary = Column(String(20), nullable=False)
    phone_secondary = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    
    # Address
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    
    # Bank details for payments
    bank_name = Column(String(100), nullable=True)
    bank_account_number = Column(String(50), nullable=True)
    bank_account_holder = Column(String(100), nullable=True)
    
    # Notes
    notes = Column(Text, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    vehicles = relationship("Vehicle", back_populates="vendor", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Vendor {self.id}: {self.company_name or self.contact_person}>"
