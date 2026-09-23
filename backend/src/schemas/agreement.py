"""Agreement schemas."""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator

from src.core.config import settings
from src.models.agreement import AgreementStatus, AgreementType
from src.models.ledger_entry import LedgerEntryType, PaymentMethod


def _normalize_to_business_wall_time(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)


class AgreementCreate(BaseModel):
    """Schema for creating a standard agreement."""

    agreement_type: AgreementType = AgreementType.CUSTOMER_VEHICLE
    customer_id: int
    vehicle_id: int
    driver_id: int | None = None  # Required if agreement_type = customer_vehicle_driver
    collateral_person_id: int | None = None  # Required for customer agreements
    pickup_datetime: datetime
    expected_return_datetime: datetime
    daily_rate: Decimal = Field(..., gt=0)
    deposit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    advance_payment: Decimal | None = Field(default=None, ge=0)  # Optional advance payment
    pickup_mileage: int | None = Field(default=None, ge=0)
    mileage_limit_per_day: int | None = Field(default=None, gt=0)
    excess_mileage_rate: Decimal | None = Field(default=None, ge=0)
    fuel_level_out: int | None = Field(default=None, ge=0, le=100)
    fuel_charge_rate: Decimal | None = Field(default=None, ge=0)
    pickup_location: str | None = None
    return_location: str | None = None
    notes: str | None = None


class AgreementExtend(BaseModel):
    """Schema for extending an agreement."""

    new_return_datetime: datetime

    @field_validator("new_return_datetime")
    @classmethod
    def normalize_to_business_wall_time(cls, value: datetime) -> datetime:
        """Normalize offset-aware clients to the local business clock."""
        return _normalize_to_business_wall_time(value)


class AgreementClose(BaseModel):
    """Schema for closing an agreement."""

    actual_return_datetime: datetime
    return_mileage: int | None = None
    # Fuel level at return (0-100). Combined with the agreement's fuel_level_out and
    # fuel_charge_rate to charge any shortfall.
    fuel_level_in: int | None = Field(None, ge=0, le=100)
    notes: str | None = None

    @field_validator("actual_return_datetime")
    @classmethod
    def normalize_to_business_wall_time(cls, value: datetime) -> datetime:
        return _normalize_to_business_wall_time(value)


class AgreementCancel(BaseModel):
    """Schema for cancelling an agreement."""

    reason: str | None = None


class VehicleSegmentResponse(BaseModel):
    """Response schema for vehicle segment."""

    id: int
    vehicle_id: int
    plate_number: str
    make: str
    model: str
    start_datetime: datetime
    end_datetime: datetime
    daily_rate: Decimal

    model_config = {"from_attributes": True}


class DriverSummary(BaseModel):
    """Summary of driver for agreement response."""
    id: int
    first_name: str
    last_name: str
    phone_primary: str
    license_number: str

    model_config = {"from_attributes": True}


class CollateralSummary(BaseModel):
    """Summary of collateral person for agreement response."""
    id: int
    first_name: str
    last_name: str
    phone_primary: str
    id_type: str
    id_number: str
    relationship_to_customer: str | None = None

    model_config = {"from_attributes": True}


class AgreementResponse(BaseModel):
    """Response schema for agreement."""

    id: int
    agreement_number: str
    agreement_type: AgreementType
    status: AgreementStatus
    customer_id: int
    customer_name: str
    driver_id: int | None = None
    driver: DriverSummary | None = None
    collateral_person_id: int | None = None
    collateral_person: CollateralSummary | None = None
    pickup_datetime: datetime
    expected_return_datetime: datetime
    actual_return_datetime: datetime | None
    agreed_daily_rate: Decimal
    deposit_amount: Decimal
    advance_payment: Decimal | None = None
    pickup_mileage: int | None = None
    return_mileage: int | None = None
    mileage_limit_per_day: int | None = None
    excess_mileage_rate: Decimal | None = None
    fuel_level_out: int | None = None
    fuel_level_in: int | None = None
    fuel_charge_rate: Decimal | None = None
    pickup_location: str | None
    return_location: str | None
    notes: str | None
    created_at: datetime
    closed_at: datetime | None

    model_config = {"from_attributes": True}


class AgreementDetailResponse(AgreementResponse):
    """Detailed response with vehicles and balance."""

    vehicle_segments: list[VehicleSegmentResponse]
    balance: Decimal
    total_charges: Decimal  # net charges, including adjustments
    net_adjustments: Decimal = Decimal("0")  # + extra charge, - discount
    total_payments: Decimal

    deposit_received: Decimal = Decimal("0")
    deposit_applied: Decimal = Decimal("0")
    deposit_returned: Decimal = Decimal("0")
    deposit_held: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")


class PostDepositRequest(BaseModel):
    """Request to receive a security deposit."""

    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    notes: str | None = None


class ApplyDepositRequest(BaseModel):
    """Request to apply (deduct) held deposit to outstanding charges."""

    amount: Decimal = Field(..., gt=0)
    notes: str | None = None


class RefundDepositRequest(BaseModel):
    """Request to refund deposit back to customer."""

    amount: Decimal = Field(..., gt=0)
    notes: str | None = None


class PostDamageChargeRequest(BaseModel):
    """Request to post a damage charge."""

    amount: Decimal = Field(..., gt=0)
    description: str = "Damage charge"
    notes: str | None = None


class PostLateFeeRequest(BaseModel):
    """Request to post an overdue/late fee."""

    amount: Decimal = Field(..., gt=0)
    description: str = "Late fee"
    notes: str | None = None


class AgreementListResponse(BaseModel):
    """Paginated list of agreements."""

    items: list[AgreementResponse]
    total: int
    page: int
    page_size: int


class LedgerEntryResponse(BaseModel):
    """Response schema for ledger entry."""

    id: int
    entry_type: LedgerEntryType
    amount: Decimal
    description: str
    payment_method: PaymentMethod | None
    payment_reference: str | None
    notes: str | None
    created_at: datetime
    created_by_name: str | None = None
    # Reversal state. Without these the client cannot tell that an entry was
    # undone, so it summed reversed rows and counted a reversed payment as
    # money collected.
    reverses_entry_id: int | None = None
    is_reversed: bool = False
    reversed_by_entry_id: int | None = None

    model_config = {"from_attributes": True}


class PostPaymentRequest(BaseModel):
    """Request to post a payment."""

    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    description: str = "Payment received"
    payment_reference: str | None = None
    notes: str | None = None


class PostAdjustmentRequest(BaseModel):
    """Request to post an adjustment."""

    amount: Decimal
    description: str
    notes: str | None = None


class WeddingVehicleConfig(BaseModel):
    """Vehicle configuration for wedding agreement."""

    vehicle_id: int
    daily_rate: Decimal = Field(..., gt=0)
    start_datetime: datetime
    end_datetime: datetime


class WeddingAgreementCreate(BaseModel):
    """Schema for creating a wedding agreement."""

    customer_id: int
    vehicles: list[WeddingVehicleConfig] = Field(..., min_length=1)
    event_date: datetime
    event_end_date: datetime | None = None
    deposit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    pickup_location: str | None = None
    return_location: str | None = None
    notes: str | None = None


class AddWeddingVehicleRequest(BaseModel):
    """Request to add a vehicle to wedding agreement."""

    vehicle_id: int
    daily_rate: Decimal = Field(..., gt=0)
    start_datetime: datetime
    end_datetime: datetime


class WeddingTotalsResponse(BaseModel):
    """Response with wedding agreement totals breakdown."""

    agreement_id: int
    agreement_number: str
    vehicle_count: int
    vehicles: list[dict]
    subtotal: Decimal
    deposit: Decimal
    total_charges: Decimal
    total_payments: Decimal
    balance: Decimal
