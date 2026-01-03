"""Agreements router."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.errors import NotFoundError
from src.core.rbac import Permission
from src.models.agreement import Agreement, AgreementStatus
from src.schemas.agreement import (
    AddWeddingVehicleRequest,
    AgreementClose,
    AgreementCreate,
    AgreementDetailResponse,
    AgreementExtend,
    AgreementListResponse,
    AgreementResponse,
    CollateralSummary,
    DriverSummary,
    LedgerEntryResponse,
    PostAdjustmentRequest,
    PostPaymentRequest,
    VehicleSegmentResponse,
    WeddingAgreementCreate,
    WeddingTotalsResponse,
)
from src.services import agreement_service, ledger_service
from src.services import wedding_agreement_service

router = APIRouter()


def _to_agreement_response(agreement: Agreement) -> AgreementResponse:
    """Convert Agreement model to response schema."""
    driver_summary = None
    if agreement.driver:
        driver_summary = DriverSummary(
            id=agreement.driver.id,
            first_name=agreement.driver.first_name,
            last_name=agreement.driver.last_name,
            phone_primary=agreement.driver.phone_primary,
            license_number=agreement.driver.license_number,
        )
    
    collateral_summary = None
    if agreement.collateral_person:
        collateral_summary = CollateralSummary(
            id=agreement.collateral_person.id,
            first_name=agreement.collateral_person.first_name,
            last_name=agreement.collateral_person.last_name,
            phone_primary=agreement.collateral_person.phone_primary,
            id_type=agreement.collateral_person.id_type,
            id_number=agreement.collateral_person.id_number,
            relationship_to_customer=agreement.collateral_person.relationship_to_customer,
        )
    
    return AgreementResponse(
        id=agreement.id,
        agreement_number=agreement.agreement_number,
        agreement_type=agreement.agreement_type,
        status=agreement.status,
        customer_id=agreement.customer_id,
        customer_name=agreement.customer.full_name,
        driver_id=agreement.driver_id,
        driver=driver_summary,
        collateral_person_id=agreement.collateral_person_id,
        collateral_person=collateral_summary,
        pickup_datetime=agreement.pickup_datetime,
        expected_return_datetime=agreement.expected_return_datetime,
        actual_return_datetime=agreement.actual_return_datetime,
        agreed_daily_rate=agreement.agreed_daily_rate,
        deposit_amount=agreement.deposit_amount,
        advance_payment=agreement.advance_payment,
        pickup_location=agreement.pickup_location,
        return_location=agreement.return_location,
        notes=agreement.notes,
        created_at=agreement.created_at,
        closed_at=agreement.closed_at,
    )


@router.get("", response_model=AgreementListResponse)
async def list_agreements(
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
    status: AgreementStatus | None = None,
    customer_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AgreementListResponse:
    """List agreements with optional filtering."""
    query = db.query(Agreement)
    
    if status:
        query = query.filter(Agreement.status == status)
    if customer_id:
        query = query.filter(Agreement.customer_id == customer_id)
    
    total = query.count()
    items = (
        query.order_by(Agreement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    return AgreementListResponse(
        items=[_to_agreement_response(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=AgreementResponse, status_code=201)
async def create_agreement(
    data: AgreementCreate,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.CREATE_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementResponse:
    """Create a new standard rental agreement."""
    agreement = agreement_service.create_standard_agreement(
        db=db,
        agreement_type=data.agreement_type,
        customer_id=data.customer_id,
        vehicle_id=data.vehicle_id,
        driver_id=data.driver_id,
        collateral_person_id=data.collateral_person_id,
        pickup_datetime=data.pickup_datetime,
        expected_return_datetime=data.expected_return_datetime,
        daily_rate=data.daily_rate,
        deposit_amount=data.deposit_amount,
        advance_payment=data.advance_payment,
        pickup_location=data.pickup_location,
        return_location=data.return_location,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    return _to_agreement_response(agreement)


@router.get("/{agreement_id}", response_model=AgreementDetailResponse)
async def get_agreement(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementDetailResponse:
    """Get agreement details including balance and ledger."""
    summary = agreement_service.get_agreement_summary(db, agreement_id)
    agreement = summary["agreement"]
    
    vehicle_segments = [
        VehicleSegmentResponse(
            id=seg.id,
            vehicle_id=seg.vehicle_id,
            plate_number=seg.vehicle.plate_number,
            make=seg.vehicle.make,
            model=seg.vehicle.model,
            start_datetime=seg.start_datetime,
            end_datetime=seg.end_datetime,
            daily_rate=seg.daily_rate,
        )
        for seg in agreement.vehicle_segments
    ]
    
    return AgreementDetailResponse(
        id=agreement.id,
        agreement_number=agreement.agreement_number,
        agreement_type=agreement.agreement_type,
        status=agreement.status,
        customer_id=agreement.customer_id,
        customer_name=agreement.customer.full_name,
        pickup_datetime=agreement.pickup_datetime,
        expected_return_datetime=agreement.expected_return_datetime,
        actual_return_datetime=agreement.actual_return_datetime,
        agreed_daily_rate=agreement.agreed_daily_rate,
        deposit_amount=agreement.deposit_amount,
        pickup_location=agreement.pickup_location,
        return_location=agreement.return_location,
        notes=agreement.notes,
        created_at=agreement.created_at,
        closed_at=agreement.closed_at,
        vehicle_segments=vehicle_segments,
        balance=summary["balance"],
        total_charges=summary["total_charges"],
        total_payments=summary["total_payments"],
    )


@router.post("/{agreement_id}/extend", response_model=AgreementResponse)
async def extend_agreement(
    agreement_id: int,
    data: AgreementExtend,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementResponse:
    """Extend an agreement's return date."""
    agreement = agreement_service.extend_agreement(
        db=db,
        agreement_id=agreement_id,
        new_return_datetime=data.new_return_datetime,
        extended_by_id=current_user.id,
    )
    return _to_agreement_response(agreement)


@router.post("/{agreement_id}/close", response_model=AgreementResponse)
async def close_agreement(
    agreement_id: int,
    data: AgreementClose,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.CLOSE_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementResponse:
    """Close an agreement (vehicle returned)."""
    import traceback
    from src.core.logging import get_logger
    logger = get_logger(__name__)
    
    try:
        agreement = agreement_service.close_agreement(
            db=db,
            agreement_id=agreement_id,
            actual_return_datetime=data.actual_return_datetime,
            return_mileage=data.return_mileage,
            closed_by_id=current_user.id,
            notes=data.notes,
        )
        return _to_agreement_response(agreement)
    except Exception as e:
        logger.error(f"Error closing agreement {agreement_id}: {e}")
        logger.error(traceback.format_exc())
        db.rollback()
        raise


@router.get("/{agreement_id}/ledger", response_model=list[LedgerEntryResponse])
async def get_agreement_ledger(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_LEDGER))],
    db: Annotated[Session, Depends(get_db)],
) -> list[LedgerEntryResponse]:
    """Get all ledger entries for an agreement."""
    entries = ledger_service.get_ledger_entries(db, agreement_id)
    return [
        LedgerEntryResponse(
            id=e.id,
            entry_type=e.entry_type,
            amount=e.amount,
            description=e.description,
            payment_method=e.payment_method,
            payment_reference=e.payment_reference,
            notes=e.notes,
            created_at=e.created_at,
        )
        for e in entries
    ]


@router.post("/{agreement_id}/payments", response_model=LedgerEntryResponse, status_code=201)
async def post_payment(
    agreement_id: int,
    data: PostPaymentRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> LedgerEntryResponse:
    """Post a payment to an agreement."""
    entry = ledger_service.post_payment(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        payment_method=data.payment_method,
        description=data.description,
        payment_reference=data.payment_reference,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    return LedgerEntryResponse(
        id=entry.id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        created_at=entry.created_at,
    )


@router.post("/{agreement_id}/adjustments", response_model=LedgerEntryResponse, status_code=201)
async def post_adjustment(
    agreement_id: int,
    data: PostAdjustmentRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_ADJUSTMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> LedgerEntryResponse:
    """Post a manual adjustment to an agreement."""
    entry = ledger_service.post_adjustment(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        description=data.description,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    return LedgerEntryResponse(
        id=entry.id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        created_at=entry.created_at,
    )


# Wedding Agreement Endpoints

@router.post("/wedding", response_model=AgreementResponse, status_code=201)
async def create_wedding_agreement(
    data: WeddingAgreementCreate,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.CREATE_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementResponse:
    """Create a new wedding agreement with multiple vehicles."""
    vehicle_configs = [
        {
            "vehicle_id": v.vehicle_id,
            "daily_rate": v.daily_rate,
            "start": v.start_datetime,
            "end": v.end_datetime,
        }
        for v in data.vehicles
    ]
    
    agreement = wedding_agreement_service.create_wedding_agreement(
        db=db,
        customer_id=data.customer_id,
        vehicle_configs=vehicle_configs,
        event_date=data.event_date,
        event_end_date=data.event_end_date,
        deposit_amount=data.deposit_amount,
        pickup_location=data.pickup_location,
        return_location=data.return_location,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    return _to_agreement_response(agreement)


@router.post("/{agreement_id}/vehicles", response_model=VehicleSegmentResponse, status_code=201)
async def add_vehicle_to_wedding_agreement(
    agreement_id: int,
    data: AddWeddingVehicleRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> VehicleSegmentResponse:
    """Add a vehicle to an existing wedding agreement."""
    segment = wedding_agreement_service.add_vehicle_to_wedding(
        db=db,
        agreement_id=agreement_id,
        vehicle_id=data.vehicle_id,
        daily_rate=data.daily_rate,
        start_datetime=data.start_datetime,
        end_datetime=data.end_datetime,
        added_by_id=current_user.id,
    )
    return VehicleSegmentResponse(
        id=segment.id,
        vehicle_id=segment.vehicle_id,
        plate_number=segment.vehicle.plate_number,
        make=segment.vehicle.make,
        model=segment.vehicle.model,
        start_datetime=segment.start_datetime,
        end_datetime=segment.end_datetime,
        daily_rate=segment.daily_rate,
    )


@router.get("/{agreement_id}/totals", response_model=WeddingTotalsResponse)
async def get_wedding_totals(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
) -> WeddingTotalsResponse:
    """Get wedding agreement totals breakdown."""
    totals = wedding_agreement_service.get_wedding_totals(db, agreement_id)
    return WeddingTotalsResponse(**totals)
