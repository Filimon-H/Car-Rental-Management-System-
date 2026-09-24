"""Public customer-facing API: auth, vehicles, bookings."""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session, joinedload

from src.api.deps.auth import CurrentCustomerUser
from src.core.db import get_db
from src.core.config import settings
from src.core.errors import BusinessError, ConflictError, ErrorCode, NotFoundError, UnauthorizedError
from src.core.security import (
    ISSUER_CUSTOMER,
    create_access_token,
    hash_password,
    verify_password,
)
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink, TelegramCustomerLinkCode
from src.models.vehicle import Vehicle, VehicleStatus
from src.schemas.public import (
    BookingCreateRequest,
    BookingQuoteRequest,
    BookingQuoteResponse,
    ExtendBookingRequest,
    ExtensionQuoteRequest,
    ExtensionQuoteResponse,
    LoginRequest,
    MyBookingResponse,
    UpdateProfileRequest,
    MyBookingVehicle,
    PublicCustomerProfile,
    PublicVehicleResponse,
    SignupRequest,
    TelegramLinkCodeResponse,
    TelegramLinkStatus,
    TokenResponse,
)
from src.schemas.fields import normalize_ethiopian_phone
from src.services import agreement_service, billing_service, ledger_service
from src.services.customer_validation_service import find_customer_by_phone, normalize_phone
from src.models.ledger_entry import LedgerEntryType

# Credential endpoints are unauthenticated and internet-facing, so they are
# rate limited the same way staff login is. Keyed on client IP.
limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _canonical_phone(value: str | None) -> str | None:
    """Store customer phones in the same +251 form staff records use.

    This used its own rule, which left a bare nine-digit number such as
    911123456 unconverted while the staff validator canonicalised it — so the
    same person signing up here and being created by staff got two different
    stored values, and duplicate detection could not match them.
    """
    if value is None:
        return None
    normalized = normalize_ethiopian_phone(value)
    return normalized if isinstance(normalized, str) else value


def _as_business_wall_clock(value: datetime) -> datetime:
    """Return the local business wall-clock value used by agreement columns."""
    if value.tzinfo is None:
        return value
    return value.astimezone(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)


def _business_now() -> datetime:
    return datetime.now(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)


def _issue_customer_token(user: CustomerUser) -> str:
    return create_access_token(
        {"sub": str(user.id), "tv": user.token_version, "iss": ISSUER_CUSTOMER}
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@router.post("/auth/signup", response_model=TokenResponse)
@limiter.limit("3/minute")
def signup(request: Request, body: SignupRequest, db: Annotated[Session, Depends(get_db)]):
    if db.query(CustomerUser).filter(CustomerUser.email == body.email).first():
        raise ConflictError("Email already registered")
    if find_customer_by_phone(db, body.phone):
        raise ConflictError("Phone number already registered")

    customer = Customer(
        first_name=body.first_name,
        last_name=body.last_name,
        phone_primary=_canonical_phone(body.phone),
        email=body.email,
        business_type="individual",
        is_active=True,
    )
    db.add(customer)
    db.flush()

    user = CustomerUser(
        customer_id=customer.id,
        email=body.email,
        hashed_password=hash_password(body.password),
        token_version=0,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=_issue_customer_token(user))


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(CustomerUser).filter(CustomerUser.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated")
    return TokenResponse(access_token=_issue_customer_token(user))


@router.post("/auth/logout")
def logout(current_user: CurrentCustomerUser, db: Annotated[Session, Depends(get_db)]):
    current_user.token_version += 1
    db.commit()
    return {"detail": "Logged out"}


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


def _profile_response(customer) -> PublicCustomerProfile:
    return PublicCustomerProfile(
        id=customer.id,
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email,
        phone_primary=customer.phone_primary,
        phone_secondary=customer.phone_secondary,
        id_type=customer.id_type,
        id_number=customer.id_number,
        id_expiry=customer.id_expiry,
        license_number=customer.license_number,
        license_expiry=customer.license_expiry,
        emergency_contact_name=customer.emergency_contact_name,
        emergency_contact_phone=customer.emergency_contact_phone,
    )


@router.get("/me", response_model=PublicCustomerProfile)
def get_me(current_user: CurrentCustomerUser, db: Annotated[Session, Depends(get_db)]):
    db.refresh(current_user)
    return _profile_response(current_user.customer)


@router.patch("/me", response_model=PublicCustomerProfile)
def update_me(
    body: UpdateProfileRequest,
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    db.refresh(current_user)
    customer = current_user.customer
    values = body.model_dump(exclude_unset=True)
    if values.get("phone_primary") and find_customer_by_phone(
        db, values["phone_primary"], exclude_customer_id=customer.id
    ):
        raise ConflictError("Phone number already registered")
    for phone_field in ("phone_primary", "phone_secondary", "emergency_contact_phone"):
        if values.get(phone_field):
            values[phone_field] = _canonical_phone(values[phone_field])
    for field, value in values.items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return _profile_response(customer)


# ---------------------------------------------------------------------------
# Vehicles (public — no auth)
# ---------------------------------------------------------------------------


def _vehicle_available_from(db: Session, vehicle_id: int) -> datetime | None:
    """Soonest future return for a booking that still holds this vehicle.

    Only segments ending in the future count. Taking the earliest segment
    outright surfaced dates that had already passed — "Available from 3 Jun
    2026" on a browse page in September — because a stale booking whose
    return date went by without the agreement being closed still matched.
    OVERDUE is included: the car is genuinely still out.
    """
    now = _as_business_wall_clock(datetime.now(timezone.utc))
    seg = (
        db.query(AgreementVehicleSegment)
        .join(Agreement, Agreement.id == AgreementVehicleSegment.agreement_id)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle_id,
            Agreement.status.in_(
                [
                    AgreementStatus.ACTIVE,
                    AgreementStatus.PENDING_PAYMENT,
                    AgreementStatus.OVERDUE,
                ]
            ),
            AgreementVehicleSegment.end_datetime > now,
        )
        .order_by(AgreementVehicleSegment.end_datetime.asc())
        .first()
    )
    return seg.end_datetime if seg else None


def _to_public_vehicle(v: Vehicle, db: Session) -> PublicVehicleResponse:
    available_from = None
    if v.status != VehicleStatus.AVAILABLE:
        available_from = _vehicle_available_from(db, v.id)
    return PublicVehicleResponse(
        id=v.id,
        make=v.make,
        model=v.model,
        year=v.year,
        vehicle_type=v.vehicle_type,
        seats=v.seats,
        transmission=v.transmission,
        color=v.color,
        daily_rate=v.daily_rate,
        weekly_rate=v.weekly_rate,
        monthly_rate=v.monthly_rate,
        photo_front=v.photo_front,
        photo_back=v.photo_back,
        photo_left=v.photo_left,
        photo_right=v.photo_right,
        is_active=v.is_active,
        status=v.status.value,
        available_from=available_from,
    )


@router.get("/vehicles", response_model=list[PublicVehicleResponse])
def list_vehicles(db: Annotated[Session, Depends(get_db)]):
    vehicles = (
        db.query(Vehicle)
        .filter(
            Vehicle.is_active.is_(True),
            # "Retired" is stored as status INACTIVE while is_active stays
            # True, so filtering on is_active alone advertised a retired car.
            Vehicle.status.notin_([VehicleStatus.INACTIVE, VehicleStatus.MAINTENANCE]),
        )
        .order_by(Vehicle.status.asc(), Vehicle.id.asc())
        .all()
    )
    return [_to_public_vehicle(v, db) for v in vehicles]


@router.get("/vehicles/{vehicle_id}", response_model=PublicVehicleResponse)
def get_vehicle(vehicle_id: int, db: Annotated[Session, Depends(get_db)]):
    v = (
        db.query(Vehicle)
        .filter(
            Vehicle.id == vehicle_id,
            Vehicle.is_active.is_(True),
            Vehicle.status.notin_([VehicleStatus.INACTIVE, VehicleStatus.MAINTENANCE]),
        )
        .first()
    )
    if not v:
        raise NotFoundError("Vehicle", vehicle_id)
    return _to_public_vehicle(v, db)


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------


def _quote_for_vehicle(vehicle: Vehicle, pickup: datetime, return_at: datetime) -> BookingQuoteResponse:
    start = _as_business_wall_clock(pickup)
    end = _as_business_wall_clock(return_at)
    if end <= start:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Return date must be after pickup date")
    days, total = billing_service.calculate_rental_charge(
        start, end, vehicle.daily_rate, vehicle.weekly_rate, vehicle.monthly_rate
    )
    uses_tiers = total < vehicle.daily_rate * days
    return BookingQuoteResponse(
        days=days,
        total=total,
        daily_rate=vehicle.daily_rate,
        weekly_rate=vehicle.weekly_rate,
        monthly_rate=vehicle.monthly_rate,
        pricing_note=("Best weekly/monthly tier applied" if uses_tiers else "Daily rate applied"),
    )


@router.post("/quotes", response_model=BookingQuoteResponse)
def quote_booking(body: BookingQuoteRequest, db: Annotated[Session, Depends(get_db)]):
    vehicle = db.query(Vehicle).filter(Vehicle.id == body.vehicle_id, Vehicle.is_active.is_(True)).first()
    if not vehicle:
        raise NotFoundError("Vehicle", body.vehicle_id)
    return _quote_for_vehicle(vehicle, body.pickup_datetime, body.expected_return_datetime)


@router.post("/bookings", response_model=MyBookingResponse)
def create_booking(
    body: BookingCreateRequest,
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == body.vehicle_id, Vehicle.is_active.is_(True)).first()
    if not vehicle:
        raise NotFoundError("Vehicle", body.vehicle_id)

    pickup = _as_business_wall_clock(body.pickup_datetime)
    return_at = _as_business_wall_clock(body.expected_return_datetime)
    if pickup <= _business_now():
        raise BusinessError(ErrorCode.INVALID_INPUT, "Pickup date must be in the future")

    if return_at <= pickup:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Return date must be after pickup date")

    # Load the linked customer
    db.refresh(current_user)
    customer = current_user.customer
    agreement_number = agreement_service.generate_agreement_number(db)

    agreement = Agreement(
        agreement_number=agreement_number,
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=AgreementStatus.BOOKING_REQUESTED,
        customer_id=customer.id,
        pickup_datetime=pickup,
        expected_return_datetime=return_at,
        agreed_daily_rate=vehicle.daily_rate,
        deposit_amount=0,
        pickup_location=body.pickup_location,
        return_location=body.return_location,
        notes=body.notes,
    )
    db.add(agreement)
    db.flush()

    segment = AgreementVehicleSegment(
        agreement_id=agreement.id,
        vehicle_id=vehicle.id,
        start_datetime=pickup,
        end_datetime=return_at,
        daily_rate=vehicle.daily_rate,
    )
    db.add(segment)
    db.commit()
    db.refresh(agreement)

    return _agreement_to_response(agreement, db)


@router.get("/bookings", response_model=list[MyBookingResponse])
def list_my_bookings(
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    db.refresh(current_user)
    agreements = (
        db.query(Agreement)
        .options(
            joinedload(Agreement.vehicle_segments).joinedload(AgreementVehicleSegment.vehicle)
        )
        .filter(Agreement.customer_id == current_user.customer.id)
        .order_by(Agreement.created_at.desc())
        .all()
    )
    return [_agreement_to_response(a, db) for a in agreements]


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(
    booking_id: int,
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    db.refresh(current_user)
    agreement = (
        db.query(Agreement)
        .filter(
            Agreement.id == booking_id,
            Agreement.customer_id == current_user.customer.id,
        )
        .first()
    )
    if not agreement:
        raise NotFoundError("Booking", booking_id)

    if agreement.status not in (AgreementStatus.BOOKING_REQUESTED, AgreementStatus.PENDING_PAYMENT):
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            f"Cannot cancel a booking with status '{agreement.status.value}'",
        )

    agreement_service.cancel_agreement(db, booking_id)
    return {"detail": "Booking cancelled"}


#: Statuses in which an agreement genuinely holds a vehicle. A booking that
#: is only requested holds nothing — staff have not approved it — which is why
#: two overlapping requests are allowed to exist.
_VEHICLE_HOLDING_STATUSES = (
    AgreementStatus.PENDING_PAYMENT,
    AgreementStatus.ACTIVE,
    AgreementStatus.OVERDUE,
)


#: Statuses an extension may be requested for. Shared by the quote and the
#: extend handler so a quote can never promise what extend will refuse.
_EXTENDABLE_STATUSES = (
    AgreementStatus.ACTIVE,
    AgreementStatus.OVERDUE,
    AgreementStatus.PENDING_PAYMENT,
    AgreementStatus.BOOKING_REQUESTED,
)


def _require_extendable(agreement: Agreement) -> None:
    if agreement.status not in _EXTENDABLE_STATUSES:
        raise BusinessError(
            ErrorCode.INVALID_INPUT,
            "Can only extend active, overdue, or pending bookings",
        )


def _extension_quote(
    agreement: Agreement, new_return: datetime
) -> ExtensionQuoteResponse:
    """Price an extension by re-pricing the whole rental.

    Charging the extra days at the flat daily rate quoted a customer more than
    the rental actually costs: 3 days + 4 days was billed 3,300 + 4,400 while
    the agreement charged the 6,500 weekly tier, and a two-month extension
    quoted 55,000 against 50,000 to book the same span outright. Tiers apply
    to the rental as a whole, so the only consistent extension price is the
    difference between the whole rental before and after.
    """
    pickup = _as_business_wall_clock(agreement.pickup_datetime)
    current_return = _as_business_wall_clock(agreement.expected_return_datetime)

    vehicle = next(
        (s.vehicle for s in agreement.vehicle_segments if s.vehicle is not None),
        None,
    )
    weekly = vehicle.weekly_rate if vehicle else None
    monthly = vehicle.monthly_rate if vehicle else None
    daily = agreement.agreed_daily_rate

    _, before = billing_service.calculate_rental_charge(
        pickup, current_return, daily, weekly, monthly
    )
    _, after = billing_service.calculate_rental_charge(
        pickup, new_return, daily, weekly, monthly
    )
    extra_days = billing_service.calculate_rental_days(current_return, new_return)
    total = after - before

    # A longer rental never costs less; guard against a tier boundary making
    # the delta negative rather than handing the customer a credit.
    if total < 0:
        total = Decimal("0")

    uses_tiers = total < daily * extra_days
    return ExtensionQuoteResponse(
        days=extra_days,
        total=total,
        daily_rate=daily,
        pricing_note=(
            "Best weekly/monthly tier applied" if uses_tiers else "Daily rate applied"
        ),
    )


@router.post("/bookings/{booking_id}/extension-quote", response_model=ExtensionQuoteResponse)
def quote_extension(
    booking_id: int,
    req: ExtensionQuoteRequest,
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    db.refresh(current_user)
    agreement = db.query(Agreement).filter(
        Agreement.id == booking_id,
        Agreement.customer_id == current_user.customer.id,
    ).first()
    if not agreement:
        raise NotFoundError("Booking", booking_id)
    # Without this the endpoint quoted 930,000 ETB to extend a rental that had
    # already closed, and priced extensions on cancelled bookings.
    _require_extendable(agreement)
    current_return = _as_business_wall_clock(agreement.expected_return_datetime)
    new_return = _as_business_wall_clock(req.new_return_datetime)
    if new_return <= current_return:
        raise BusinessError(ErrorCode.INVALID_INPUT, "New return date must be later than the current return date")
    return _extension_quote(agreement, new_return)


@router.post("/bookings/{booking_id}/extend", response_model=MyBookingResponse)
def extend_booking(
    booking_id: int,
    req: ExtendBookingRequest,
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
) -> MyBookingResponse:
    from src.repositories import availability_repository

    db.refresh(current_user)
    agreement = (
        db.query(Agreement)
        .filter(
            Agreement.id == booking_id,
            Agreement.customer_id == current_user.customer.id,
        )
        .first()
    )
    if not agreement:
        raise NotFoundError("Booking", booking_id)

    _require_extendable(agreement)

    new_dt = _as_business_wall_clock(req.new_return_datetime)
    current_return = _as_business_wall_clock(agreement.expected_return_datetime)

    if new_dt <= current_return:
        raise BusinessError(ErrorCode.INVALID_INPUT, "New return date must be later than the current return date")

    # Check vehicle availability for the extension window
    segment = next(
        (s for s in agreement.vehicle_segments if s.vehicle_id is not None),
        None,
    )
    if segment:
        # Only a real hold blocks an extension.
        #
        # This used to call check_vehicle_available, which counts any
        # non-cancelled agreement — including other BOOKING_REQUESTED rows.
        # But creating a booking does not check availability at all, so a
        # customer could make two overlapping requests without warning and
        # then be refused an extension because of the one the system had just
        # let them create. Requests are requests: nothing is reserved until
        # staff approve. The error also named no agreement, so there was no
        # way to tell which booking was in the way.
        blocker = (
            db.query(Agreement)
            .join(AgreementVehicleSegment)
            .filter(
                AgreementVehicleSegment.vehicle_id == segment.vehicle_id,
                Agreement.id != agreement.id,
                Agreement.status.in_(_VEHICLE_HOLDING_STATUSES),
                AgreementVehicleSegment.start_datetime < new_dt,
                AgreementVehicleSegment.end_datetime > current_return,
            )
            .first()
        )
        if blocker:
            raise BusinessError(
                ErrorCode.INVALID_INPUT,
                f"Vehicle is already booked during that extension period "
                f"by {blocker.agreement_number}",
            )

    # Price it before the dates move: the quote re-prices the whole rental, so
    # it has to see the rental as the customer saw it when they were quoted.
    quote = _extension_quote(agreement, new_dt)

    if segment:
        segment.end_datetime = new_dt

    agreement.expected_return_datetime = new_dt
    agreement.return_reminder_sent_days = None

    # Post extension charge if a rental charge already exists (i.e. agreement
    # was already approved/active — not a bare booking_requested with no charge yet).
    if agreement.status in (AgreementStatus.PENDING_PAYMENT, AgreementStatus.ACTIVE, AgreementStatus.OVERDUE):
        # Charge exactly what was quoted. This used to re-derive the amount
        # from the flat daily rate, so a customer quoted the weekly tier was
        # still billed day-by-day.
        ledger_service.post_charge(
            db=db,
            agreement_id=agreement.id,
            amount=quote.total,
            description=(
                f"Extension charge: +{quote.days} day(s) — {quote.pricing_note}"
            ),
            entry_type=LedgerEntryType.CHARGE,
            auto_commit=False,
        )

    db.commit()
    db.refresh(agreement)
    return _agreement_to_response(agreement, db)


# ---------------------------------------------------------------------------
# Telegram link (customer)
# ---------------------------------------------------------------------------


def _generate_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


@router.post("/me/telegram/link-code", response_model=TelegramLinkCodeResponse)
def generate_telegram_link_code(
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    db.query(TelegramCustomerLinkCode).filter(
        TelegramCustomerLinkCode.customer_user_id == current_user.id,
        TelegramCustomerLinkCode.used_at.is_(None),
    ).delete(synchronize_session=False)

    code = _generate_code()
    while db.query(TelegramCustomerLinkCode).filter(TelegramCustomerLinkCode.code == code).first():
        code = _generate_code()

    link_code = TelegramCustomerLinkCode(
        customer_user_id=current_user.id,
        code=code,
        expires_at=_utc_now() + timedelta(minutes=15),
    )
    db.add(link_code)
    db.commit()
    db.refresh(link_code)
    return TelegramLinkCodeResponse(code=link_code.code, expires_at=link_code.expires_at)


@router.get("/me/telegram", response_model=TelegramLinkStatus)
def get_telegram_status(
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    link = (
        db.query(TelegramCustomerLink)
        .filter(
            TelegramCustomerLink.customer_user_id == current_user.id,
            TelegramCustomerLink.is_active.is_(True),
        )
        .first()
    )
    if not link:
        return TelegramLinkStatus(linked=False)
    return TelegramLinkStatus(
        linked=True,
        telegram_username=link.telegram_username,
        linked_at=link.linked_at,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _agreement_to_response(a: Agreement, db: Session | None = None) -> MyBookingResponse:
    vehicle = None
    if a.vehicle_segments:
        segs = list(a.vehicle_segments) if not hasattr(a.vehicle_segments, "__iter__") else a.vehicle_segments
        seg = next(iter(segs), None)
        if seg and seg.vehicle:
            v = seg.vehicle
            vehicle = MyBookingVehicle(
                id=v.id,
                make=v.make,
                model=v.model,
                year=v.year,
                plate_number=v.plate_number,
            )

    total_charge = None
    total_paid = None
    balance_due = None
    deposit_received = Decimal("0")
    deposit_held = Decimal("0")
    if db is not None:
        # Use the shared breakdown rather than a fifth copy of this formula.
        # The local version left out adjustments, so a customer given a 600
        # discount was still shown the full amount owed — the same fault as
        # the dashboard's outstanding tile.
        breakdown = agreement_service.get_balance_breakdown(db, a.id)
        total_charge = breakdown["total_charges"] + breakdown["net_adjustments"]
        total_paid = breakdown["total_payments"]
        balance_due = breakdown["balance_due"]
        deposit_received = breakdown["deposit_received"]
        deposit_held = breakdown["deposit_held"]

    return MyBookingResponse(
        id=a.id,
        agreement_number=a.agreement_number,
        status=a.status.value,
        pickup_datetime=a.pickup_datetime,
        expected_return_datetime=a.expected_return_datetime,
        agreed_daily_rate=a.agreed_daily_rate,
        pickup_location=a.pickup_location,
        return_location=a.return_location,
        notes=a.notes,
        created_at=a.created_at,
        vehicle=vehicle,
        total_charge=total_charge,
        total_paid=total_paid,
        balance_due=balance_due,
        # Both columns are nullable, and the response declares them as plain
        # Decimal — an unset advance_payment failed validation outright.
        deposit_amount=a.deposit_amount or Decimal("0"),
        advance_payment=a.advance_payment or Decimal("0"),
        deposit_received=deposit_received,
        deposit_held=deposit_held,
        mileage_limit_per_day=a.mileage_limit_per_day,
        excess_mileage_rate=a.excess_mileage_rate,
        fuel_level_out=a.fuel_level_out,
        fuel_charge_rate=a.fuel_charge_rate,
    )
