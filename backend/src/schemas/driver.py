"""Pydantic schemas for Driver."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, EmailStr


class DriverBase(BaseModel):
    """Base driver schema."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_primary: str = Field(..., min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    id_type: Optional[str] = Field(None, max_length=50)
    id_number: Optional[str] = Field(None, max_length=50)
    license_number: str = Field(..., min_length=3, max_length=50)
    license_expiry: Optional[datetime] = None
    license_class: Optional[str] = Field(None, max_length=20)
    house_number: Optional[str] = Field(None, max_length=50)
    wereda: Optional[str] = Field(None, max_length=100)
    subcity: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=150)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None


class DriverCreate(DriverBase):
    """Schema for creating a driver."""
    pass


class DriverUpdate(BaseModel):
    """Schema for updating a driver."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone_primary: Optional[str] = Field(None, min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    id_type: Optional[str] = Field(None, max_length=50)
    id_number: Optional[str] = Field(None, max_length=50)
    license_number: Optional[str] = Field(None, min_length=3, max_length=50)
    license_expiry: Optional[datetime] = None
    license_class: Optional[str] = Field(None, max_length=20)
    house_number: Optional[str] = Field(None, max_length=50)
    wereda: Optional[str] = Field(None, max_length=100)
    subcity: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=150)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class DriverResponse(DriverBase):
    """Schema for driver response."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DriverListResponse(BaseModel):
    """Schema for paginated driver list response."""
    items: list[DriverResponse]
    total: int
    page: int
    page_size: int
    pages: int


class DriverSummary(BaseModel):
    """Summary schema for driver in agreement responses."""
    id: int
    first_name: str
    last_name: str
    phone_primary: str
    license_number: str
    license_expiry: Optional[datetime] = None

    model_config = {"from_attributes": True}
