"""Pydantic schemas for staff user management."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from src.core.rbac import Role


class StaffUserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)
    role: Role = Role.SALES


class StaffUserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class StaffUserResetPassword(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


class StaffUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StaffUserListResponse(BaseModel):
    items: list[StaffUserResponse]
    total: int
    page: int
    page_size: int
