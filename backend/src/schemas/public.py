"""Pydantic schemas for public customer-facing endpoints."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=7, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PublicCustomerProfile(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: Optional[str]
    phone_primary: str
    phone_secondary: Optional[str] = None
    id_type: Optional[str] = None        # national_id | passport | kebele_id
    id_number: Optional[str] = None
    id_expiry: Optional[datetime] = None
    license_number: Optional[str] = None
    license_expiry: Optional[datetime] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    phone_primary: Optional[str] = Field(None, min_length=7, max_length=20)
    phone_secondary: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_expiry: Optional[datetime] = None
    license_number: Optional[str] = None
    license_expiry: Optional[datetime] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class PublicVehicleResponse(BaseModel):
    id: int
    make: str
    model: str
    year: int
    vehicle_type: str
    seats: int
    transmission: Optional[str]
    color: str
    daily_rate: Decimal
    weekly_rate: Optional[Decimal] = None
    monthly_rate: Optional[Decimal] = None
    photo_front: Optional[str]
    photo_back: Optional[str]
    photo_left: Optional[str]
    photo_right: Optional[str]
    is_active: bool
    status: str  # available | reserved | rented
    available_from: Optional[datetime] = None  # set when reserved or rented

    class Config:
        from_attributes = True


class BookingCreateRequest(BaseModel):
    vehicle_id: int
    pickup_datetime: datetime
    expected_return_datetime: datetime
    pickup_location: Optional[str] = None
    return_location: Optional[str] = None
    notes: Optional[str] = None


class ExtendBookingRequest(BaseModel):
    new_return_datetime: datetime


class BookingQuoteRequest(BaseModel):
    vehicle_id: int
    pickup_datetime: datetime
    expected_return_datetime: datetime


class BookingQuoteResponse(BaseModel):
    days: int
    total: Decimal
    daily_rate: Decimal
    weekly_rate: Optional[Decimal] = None
    monthly_rate: Optional[Decimal] = None
    pricing_note: str


class ExtensionQuoteRequest(BaseModel):
    new_return_datetime: datetime


class ExtensionQuoteResponse(BaseModel):
    days: int
    total: Decimal
    daily_rate: Decimal
    # The extend step showed a bare number while the booking page explained
    # which tier it had applied, so a tiered extension looked like an error.
    pricing_note: str | None = None


class MyBookingVehicle(BaseModel):
    id: int
    make: str
    model: str
    year: int
    plate_number: str

    class Config:
        from_attributes = True


class MyBookingResponse(BaseModel):
    id: int
    agreement_number: str
    status: str
    pickup_datetime: datetime
    expected_return_datetime: datetime
    agreed_daily_rate: Decimal
    pickup_location: Optional[str]
    return_location: Optional[str]
    notes: Optional[str]
    created_at: datetime
    vehicle: Optional[MyBookingVehicle] = None
    total_charge: Optional[Decimal] = None
    total_paid: Optional[Decimal] = None
    balance_due: Optional[Decimal] = None
    deposit_amount: Decimal = Decimal("0")
    advance_payment: Decimal = Decimal("0")
    deposit_received: Decimal = Decimal("0")
    deposit_held: Decimal = Decimal("0")
    mileage_limit_per_day: Optional[int] = None
    excess_mileage_rate: Optional[Decimal] = None
    fuel_level_out: Optional[int] = None
    fuel_charge_rate: Optional[Decimal] = None

    class Config:
        from_attributes = True


class TelegramLinkCodeResponse(BaseModel):
    code: str
    expires_at: datetime


class TelegramLinkStatus(BaseModel):
    linked: bool
    telegram_username: Optional[str] = None
    linked_at: Optional[datetime] = None
