"""Pydantic schemas for customer operations."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class CustomerBase(BaseModel):
    """Base customer schema."""
    business_type: str = Field(default="individual", max_length=50)  # individual, company, government, embassy, ngo, church
    company_name: Optional[str] = Field(None, max_length=200)  # Required if not individual
    tin_number: Optional[str] = Field(None, max_length=50)  # Tax ID
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_primary: str = Field(..., min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    id_type: Optional[str] = Field(None, max_length=50)  # passport, national_id, kebele_id - only for individual
    id_number: Optional[str] = Field(None, max_length=50)  # Only for individual
    id_expiry_date: Optional[datetime] = None
    driver_license_number: Optional[str] = Field(None, max_length=50)  # Only for individual
    driver_license_expiry: Optional[datetime] = None
    house_number: Optional[str] = Field(None, max_length=50)
    wereda: Optional[str] = Field(None, max_length=100)
    subcity: Optional[str] = Field(None, max_length=100)  # Bole, Lideta, Yeka
    city: Optional[str] = Field(None, max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    """Schema for creating a customer."""
    pass


class CustomerUpdate(BaseModel):
    """Schema for updating a customer."""
    business_type: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=200)
    tin_number: Optional[str] = Field(None, max_length=50)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone_primary: Optional[str] = Field(None, min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    id_type: Optional[str] = Field(None, max_length=50)
    id_number: Optional[str] = Field(None, min_length=3, max_length=50)
    id_expiry_date: Optional[datetime] = None
    driver_license_number: Optional[str] = Field(None, max_length=50)
    driver_license_expiry: Optional[datetime] = None
    house_number: Optional[str] = Field(None, max_length=50)
    wereda: Optional[str] = Field(None, max_length=100)
    subcity: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    """Schema for customer response."""
    id: int
    business_type: str
    company_name: Optional[str] = None
    tin_number: Optional[str] = None
    first_name: str
    last_name: str
    full_name: str  # Computed property
    phone_primary: str
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    id_type: str
    id_number: str
    id_expiry_date: Optional[datetime] = None
    driver_license_number: str
    driver_license_expiry: Optional[datetime] = None
    house_number: Optional[str] = None
    wereda: Optional[str] = None
    subcity: Optional[str] = None
    city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        """Custom validator to map model fields to schema fields."""
        return cls(
            id=obj.id,
            business_type=obj.business_type,
            company_name=obj.company_name,
            tin_number=obj.tin_number,
            first_name=obj.first_name,
            last_name=obj.last_name,
            full_name=obj.full_name,
            phone_primary=obj.phone_primary,
            phone_secondary=obj.phone_secondary,
            email=obj.email,
            id_type=obj.id_type,
            id_number=obj.id_number,
            id_expiry_date=obj.id_expiry,
            driver_license_number=obj.license_number,
            driver_license_expiry=obj.license_expiry,
            house_number=obj.house_number,
            wereda=obj.wereda,
            subcity=obj.subcity,
            city=obj.city,
            emergency_contact_name=obj.emergency_contact_name,
            emergency_contact_phone=obj.emergency_contact_phone,
            notes=obj.notes,
            is_active=obj.is_active,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class CustomerListResponse(BaseModel):
    """Schema for paginated customer list."""
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int


class CustomerSearchResult(BaseModel):
    """Schema for customer lookup search results."""
    id: int
    full_name: str
    phone_primary: str
    id_number: str

    class Config:
        from_attributes = True
