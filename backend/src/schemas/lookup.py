"""Pydantic schemas for lookup values."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LookupValueBase(BaseModel):
    """Base lookup value schema."""
    category: str = Field(..., max_length=50)
    value: str = Field(..., max_length=100)
    label: Optional[str] = Field(None, max_length=100)
    sort_order: int = Field(default=0)


class LookupValueCreate(LookupValueBase):
    """Schema for creating a lookup value."""
    pass


class LookupValueUpdate(BaseModel):
    """Schema for updating a lookup value."""
    value: Optional[str] = Field(None, max_length=100)
    label: Optional[str] = Field(None, max_length=100)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class LookupValueResponse(LookupValueBase):
    """Schema for lookup value response."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LookupCategoryResponse(BaseModel):
    """Schema for lookup category with values."""
    category: str
    values: list[LookupValueResponse]
