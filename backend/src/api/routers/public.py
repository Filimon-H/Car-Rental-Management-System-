"""Public customer-facing API: auth, vehicles, bookings."""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session, joinedload

from src.api.deps.auth import CurrentCustomerUser
from src.core.db import get_db
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
    ExtendBookingRequest,
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
from src.services import agreement_service, billing_service, ledger_service
from src.services.customer_validation_service import find_customer_by_phone
from src.models.ledger_entry import LedgerEntryType

# Credential endpoints are unauthenticated and internet-facing, so they are
# rate limited the same way staff login is. Keyed on client IP.
limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


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
        phone_primary=body.phone,
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
    if body.phone_primary and find_customer_by_phone(
        db, body.phone_primary, exclude_customer_id=customer.id
    ):
        raise ConflictError("Phone number already registered")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return _profile_response(customer)


# ---------------------------------------------------------------------------
# Vehicles (public — no auth)
# ---------------------------------------------------------------------------


def _vehicle_available_from(db: Session, vehicle_id: int) -> datetime | None:
    """Return the soonest expected_return_datetime for active/reserved segments on this vehicle."""
    seg = (
        db.query(AgreementVehicleSegment)
        .join(Agreement, Agreement.id == AgreementVehicleSegment.agreement_id)
        .filter(
            AgreementVehicleSegment.vehicle_id == vehicle_id,
            Agreement.status.in_([AgreementStatus.ACTIVE, AgreementStatus.PENDING_PAYMENT]),
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
        .filter(Vehicle.is_active.is_(True))
        .order_by(Vehicle.status.asc(), Vehicle.id.asc())
        .all()
    )
    return [_to_public_vehicle(v, db) for v in vehicles]


@router.get("/vehicles/{vehicle_id}", response_model=PublicVehicleResponse)
def get_vehicle(vehicle_id: int, db: Annotated[Session, Depends(get_db)]):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.is_active.is_(True)).first()
    if not v:
        raise NotFoundError("Vehicle", vehicle_id)
    return _to_public_vehicle(v, db)


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------


@router.post("/bookings", response_model=MyBookingResponse)
def create_booking(
    body: BookingCreateRequest,
    current_user: CurrentCustomerUser,
    db: Annotated[Session, Depends(get_db)],
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == body.vehicle_id, Vehicle.is_active.is_(True)).first()
    if not vehicle:
        raise NotFoundError("Vehicle", body.vehicle_id)

    now = datetime.now(timezone.utc)
    pickup = body.pickup_datetime if body.pickup_datetime.tzinfo else body.pickup_datetime.replace(tzinfo=timezone.utc)
    if pickup <= now:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Pickup date must be in the future")

    if body.expected_return_datetime <= body.pickup_datetime:
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
        pickup_datetime=body.pickup_datetime,
        expected_return_datetime=body.expected_return_datetime,
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
        start_datetime=body.pickup_datetime,
        end_datetime=body.expected_return_datetime,
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

    if agreement.status not in (
        AgreementStatus.ACTIVE,
        AgreementStatus.PENDING_PAYMENT,
        AgreementStatus.BOOKING_REQUESTED,
    ):
        raise BusinessError(ErrorCode.INVALID_INPUT, "Can only extend active or pending bookings")

    new_dt = req.new_return_datetime
    if new_dt.tzinfo is None:
        new_dt = new_dt.replace(tzinfo=timezone.utc)

    current_return = agreement.expected_return_datetime
    if current_return.tzinfo is None:
        current_return = current_return.replace(tzinfo=timezone.utc)

    if new_dt <= current_return:
        raise BusinessError(ErrorCode.INVALID_INPUT, "New return date must be later than the current return date")

    # Check vehicle availability for the extension window
    segment = next(
        (s for s in agreement.vehicle_segments if s.vehicle_id is not None),
        None,
    )
    if segment:
        # Extension: this agreement already holds the vehicle, so RENTED is the
        # expected status and the gate would reject its own rental.
        available = availability_repository.check_vehicle_available(
            db,
            segment.vehicle_id,
            current_return,
            new_dt,
            exclude_agreement_id=agreement.id,
            skip_status_check=True,
        )
        if not available:
            raise BusinessError(ErrorCode.INVALID_INPUT, "Vehicle is already booked during that extension period")
        segment.end_datetime = new_dt

    agreement.expected_return_datetime = new_dt
    agreement.return_reminder_sent_days = None

    # Post extension charge if a rental charge already exists (i.e. agreement
    # was already approved/active — not a bare booking_requested with no charge yet).
    if agreement.status in (AgreementStatus.PENDING_PAYMENT, AgreementStatus.ACTIVE):
        ext_days, ext_charge = billing_service.calculate_rental_charge(
            current_return, new_dt, agreement.agreed_daily_rate
        )
        ledger_service.post_charge(
            db=db,
            agreement_id=agreement.id,
            amount=ext_charge,
            description=f"Extension charge: +{ext_days} day(s) @ {agreement.agreed_daily_rate}/day",
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
    if db is not None:
        # Use the shared breakdown rather than a fifth copy of this formula.
        # The local version left out adjustments, so a customer given a 600
        # discount was still shown the full amount owed — the same fault as
        # the dashboard's outstanding tile.
        breakdown = agreement_service.get_balance_breakdown(db, a.id)
        total_charge = breakdown["total_charges"] + breakdown["net_adjustments"]
        total_paid = breakdown["total_payments"]
        balance_due = breakdown["balance_due"]

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
    )
