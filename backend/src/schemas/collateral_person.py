"""Pydantic schemas for CollateralPerson."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, EmailStr


class CollateralPersonBase(BaseModel):
    """Base collateral person schema."""
    customer_id: int = Field(..., description="ID of the customer this collateral is for")
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_primary: str = Field(..., min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    relationship_to_customer: Optional[str] = Field(None, max_length=100)
    id_type: str = Field(..., max_length=50)
    id_number: str = Field(..., min_length=3, max_length=50)
    house_number: Optional[str] = Field(None, max_length=50)
    wereda: Optional[str] = Field(None, max_length=100)
    subcity: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    occupation: Optional[str] = Field(None, max_length=100)
    employer_name: Optional[str] = Field(None, max_length=200)
    employer_phone: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None


class CollateralPersonCreate(CollateralPersonBase):
    """Schema for creating a collateral person."""
    pass


class CollateralPersonUpdate(BaseModel):
    """Schema for updating a collateral person."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone_primary: Optional[str] = Field(None, min_length=9, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    relationship_to_customer: Optional[str] = Field(None, max_length=100)
    id_type: Optional[str] = Field(None, max_length=50)
    id_number: Optional[str] = Field(None, max_length=50)
    house_number: Optional[str] = Field(None, max_length=50)
    wereda: Optional[str] = Field(None, max_length=100)
    subcity: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    occupation: Optional[str] = Field(None, max_length=100)
    employer_name: Optional[str] = Field(None, max_length=200)
    employer_phone: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerSummary(BaseModel):
    """Summary of customer for collateral response."""
    id: int
    first_name: str
    last_name: str
    phone_primary: str
    business_type: str

    model_config = {"from_attributes": True}


class CollateralPersonResponse(BaseModel):
    """Schema for collateral person response."""
    id: int
    customer_id: int
    first_name: str
    last_name: str
    phone_primary: str
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    relationship_to_customer: Optional[str] = None
    id_type: str
    id_number: str
    house_number: Optional[str] = None
    wereda: Optional[str] = None
    subcity: Optional[str] = None
    city: Optional[str] = None
    occupation: Optional[str] = None
    employer_name: Optional[str] = None
    employer_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    customer: Optional[CustomerSummary] = None

    model_config = {"from_attributes": True}


class CollateralPersonListResponse(BaseModel):
    """Schema for paginated collateral person list response."""
    items: list[CollateralPersonResponse]
    total: int
    page: int
    page_size: int
    pages: int


class CollateralPersonSummary(BaseModel):
    """Summary schema for collateral person in agreement responses."""
    id: int
    first_name: str
    last_name: str
    phone_primary: str
    id_type: str
    id_number: str
    relationship_to_customer: Optional[str] = None

    model_config = {"from_attributes": True}
