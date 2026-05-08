"""Pydantic schemas for vendor operations."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from src.models.ledger_entry import PaymentMethod


class VendorBase(BaseModel):
    """Base vendor schema."""
    vendor_type: str = Field(default="company", max_length=20)  # individual, company
    company_name: Optional[str] = Field(None, max_length=200)  # Required if vendor_type is company
    contact_person: Optional[str] = Field(None, max_length=100)
    phone_primary: str = Field(..., min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_account_number: Optional[str] = Field(None, max_length=50)
    bank_account_holder: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class VendorCreate(VendorBase):
    """Schema for creating a vendor."""
    pass


class VendorUpdate(BaseModel):
    """Schema for updating a vendor."""
    vendor_type: Optional[str] = Field(None, max_length=20)
    company_name: Optional[str] = Field(None, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone_primary: Optional[str] = Field(None, min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_account_number: Optional[str] = Field(None, max_length=50)
    bank_account_holder: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class VendorResponse(BaseModel):
    """Schema for vendor response."""
    id: int
    vendor_type: str
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone_primary: str
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_holder: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VendorListResponse(BaseModel):
    """Schema for paginated vendor list."""
    items: list[VendorResponse]
    total: int
    page: int
    page_size: int


class VendorSearchResult(BaseModel):
    """Schema for vendor lookup search results."""
    id: int
    company_name: str
    contact_person: Optional[str]
    phone_primary: str

    class Config:
        from_attributes = True


class VendorAgreementPayableResponse(BaseModel):
    agreement_id: int
    agreement_number: str
    agreement_status: str
    payable_amount: Decimal
    segment_count: int


class VendorPayableSummaryResponse(BaseModel):
    vendor_id: int
    vendor_name: str
    reserved_amount: Decimal
    earned_amount: Decimal
    paid_amount: Decimal
    outstanding_payable: Decimal
    agreement_count: int
    agreements: list[VendorAgreementPayableResponse]


class VendorPaymentCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    agreement_id: Optional[int] = None


class VendorPaymentResponse(BaseModel):
    id: int
    vendor_id: int
    agreement_id: Optional[int] = None
    amount: Decimal
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
