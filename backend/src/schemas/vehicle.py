"""Pydantic schemas for vehicle operations."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from src.models.vehicle import VehicleStatus


class VendorSummary(BaseModel):
    """Summary vendor info for vehicle response."""
    id: int
    vendor_type: str
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone_primary: str
    email: Optional[str] = None

    class Config:
        from_attributes = True


class VehicleBase(BaseModel):
    """Base vehicle schema."""
    vendor_id: int  # Required - every vehicle must have a vendor
    plate_number: str = Field(..., min_length=1, max_length=20)
    plate_code: str = Field(..., max_length=20)  # 01, 02, 03, 05, Daily, Temporary, Other
    plate_city: Optional[str] = Field(None, max_length=50)
    make: str = Field(..., min_length=1, max_length=50)
    model: str = Field(..., min_length=1, max_length=50)
    year: int = Field(..., ge=1990, le=2030)
    color: str = Field(..., min_length=1, max_length=30)
    vehicle_type: str = Field(..., max_length=30)  # Standard, Compact, Sportcar, Luxury, Pickup, Van
    service_type: str = Field(..., max_length=30)  # Business, Field Work, Wedding, Luxury, Other
    car_condition: str = Field(default="good", max_length=30)  # Excellent, Very Good, Good, Not Good, Risky
    motor_number: Optional[str] = Field(None, max_length=50)
    chassis_number: Optional[str] = Field(None, max_length=50)
    seats: int = Field(default=5, ge=1, le=50)
    transmission: str = Field(default="automatic", max_length=20)
    fuel_type: str = Field(default="petrol", max_length=20)  # Petrol, Diesel, Hybrid, Electric, Other
    daily_rate: Decimal = Field(..., ge=0, decimal_places=2)
    insurance_policy_number: Optional[str] = Field(None, max_length=50)
    insurance_expiry: Optional[datetime] = None
    current_mileage: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class VehicleCreate(VehicleBase):
    """Schema for creating a vehicle."""
    pass


class VehicleUpdate(BaseModel):
    """Schema for updating a vehicle."""
    vendor_id: Optional[int] = None
    plate_number: Optional[str] = Field(None, min_length=1, max_length=20)
    plate_code: Optional[str] = Field(None, max_length=20)
    plate_city: Optional[str] = Field(None, max_length=50)
    make: Optional[str] = Field(None, min_length=1, max_length=50)
    model: Optional[str] = Field(None, min_length=1, max_length=50)
    year: Optional[int] = Field(None, ge=1990, le=2030)
    color: Optional[str] = Field(None, min_length=1, max_length=30)
    vehicle_type: Optional[str] = Field(None, max_length=30)
    service_type: Optional[str] = Field(None, max_length=30)
    car_condition: Optional[str] = Field(None, max_length=30)
    motor_number: Optional[str] = Field(None, max_length=50)
    chassis_number: Optional[str] = Field(None, max_length=50)
    seats: Optional[int] = Field(None, ge=1, le=50)
    transmission: Optional[str] = Field(None, max_length=20)
    fuel_type: Optional[str] = Field(None, max_length=20)
    daily_rate: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    insurance_policy_number: Optional[str] = Field(None, max_length=50)
    insurance_expiry: Optional[datetime] = None
    current_mileage: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class VehicleStatusUpdate(BaseModel):
    """Schema for updating vehicle status."""
    status: VehicleStatus
    notes: Optional[str] = None


class VehicleResponse(BaseModel):
    """Schema for vehicle response."""
    id: int
    vendor_id: int
    vendor: Optional[VendorSummary] = None
    plate_number: str
    plate_code: str
    plate_city: Optional[str] = None
    make: str
    model: str
    year: int
    color: str
    vehicle_type: str
    service_type: str
    car_condition: str
    motor_number: Optional[str] = None
    chassis_number: Optional[str] = None
    seats: int
    transmission: str
    fuel_type: str
    daily_rate: Decimal
    insurance_policy_number: Optional[str] = None
    insurance_expiry: Optional[datetime] = None
    current_mileage: Optional[int] = None
    notes: Optional[str] = None
    status: VehicleStatus
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        """Custom validator to map model fields to schema fields."""
        vendor_data = None
        if obj.vendor:
            vendor_data = VendorSummary(
                id=obj.vendor.id,
                vendor_type=obj.vendor.vendor_type,
                company_name=obj.vendor.company_name,
                contact_person=obj.vendor.contact_person,
                phone_primary=obj.vendor.phone_primary,
                email=obj.vendor.email,
            )
        return cls(
            id=obj.id,
            vendor_id=obj.vendor_id,
            vendor=vendor_data,
            plate_number=obj.plate_number,
            plate_code=obj.plate_code,
            plate_city=obj.plate_city,
            make=obj.make,
            model=obj.model,
            year=obj.year,
            color=obj.color,
            vehicle_type=obj.vehicle_type,
            service_type=obj.service_type,
            car_condition=obj.car_condition,
            motor_number=obj.motor_number,
            chassis_number=obj.chassis_number,
            seats=obj.seats,
            transmission=obj.transmission,
            fuel_type=obj.fuel_type,
            daily_rate=obj.daily_rate,
            insurance_policy_number=obj.insurance_policy,
            insurance_expiry=obj.insurance_expiry,
            current_mileage=obj.current_mileage,
            notes=obj.notes,
            status=obj.status,
            is_active=obj.is_active,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class VehicleListResponse(BaseModel):
    """Schema for paginated vehicle list."""
    items: list[VehicleResponse]
    total: int
    page: int
    page_size: int


class VehicleSearchResult(BaseModel):
    """Schema for vehicle lookup search results."""
    id: int
    plate_number: str
    make: str
    model: str
    year: int
    color: str
    vehicle_type: str
    status: VehicleStatus
    daily_rate: Decimal

    class Config:
        from_attributes = True
