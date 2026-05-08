"""Ledger API router for direct ledger operations."""

from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.ledger_entry import LedgerEntry, LedgerEntryType, PaymentMethod
from src.services import ledger_service

router = APIRouter()


# Schemas
class LedgerEntryResponse(BaseModel):
    id: int
    agreement_id: int
    entry_type: LedgerEntryType
    amount: Decimal
    description: str
    payment_method: Optional[PaymentMethod] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    reversed_entry_id: Optional[int] = None
    created_at: str
    created_by_id: Optional[int] = None

    class Config:
        from_attributes = True


class PostChargeRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    description: str
    entry_type: LedgerEntryType = LedgerEntryType.CHARGE
    notes: Optional[str] = None


class PostPaymentRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    description: str = "Payment received"
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class PostAdjustmentRequest(BaseModel):
    amount: Decimal  # Can be positive or negative
    description: str
    notes: Optional[str] = None


class PostDepositRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    description: str = "Security deposit received"
    notes: Optional[str] = None


class ReverseEntryRequest(BaseModel):
    reason: str


class BalanceResponse(BaseModel):
    agreement_id: int
    balance: Decimal
    total_charges: Decimal
    total_payments: Decimal


# Endpoints
@router.get("/{agreement_id}", response_model=list[LedgerEntryResponse])
async def get_ledger_entries(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Get all ledger entries for an agreement."""
    entries = ledger_service.get_ledger_entries(db, agreement_id)
    return [LedgerEntryResponse(
        id=e.id,
        agreement_id=e.agreement_id,
        entry_type=e.entry_type,
        amount=e.amount,
        description=e.description,
        payment_method=e.payment_method,
        payment_reference=e.payment_reference,
        notes=e.notes,
        reversed_entry_id=e.reversed_entry_id,
        created_at=e.created_at.isoformat(),
        created_by_id=e.created_by_id,
    ) for e in entries]


@router.get("/{agreement_id}/balance", response_model=BalanceResponse)
async def get_balance(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_AGREEMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Get current balance for an agreement."""
    balance = ledger_service.get_agreement_balance(db, agreement_id)
    total_charges = ledger_service.get_total_charges(db, agreement_id)
    total_payments = ledger_service.get_total_payments(db, agreement_id)
    
    return BalanceResponse(
        agreement_id=agreement_id,
        balance=balance,
        total_charges=total_charges,
        total_payments=total_payments,
    )


@router.post("/{agreement_id}/charges", response_model=LedgerEntryResponse, status_code=201)
async def post_charge(
    agreement_id: int,
    data: PostChargeRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post a charge to the ledger."""
    entry = ledger_service.post_charge(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        description=data.description,
        entry_type=data.entry_type,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    return LedgerEntryResponse(
        id=entry.id,
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/{agreement_id}/payments", response_model=LedgerEntryResponse, status_code=201)
async def post_payment(
    agreement_id: int,
    data: PostPaymentRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post a payment to the ledger."""
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
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/{agreement_id}/deposits", response_model=LedgerEntryResponse, status_code=201)
async def post_deposit(
    agreement_id: int,
    data: PostDepositRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_PAYMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post a deposit to the ledger."""
    entry = ledger_service.post_deposit(
        db=db,
        agreement_id=agreement_id,
        amount=data.amount,
        payment_method=data.payment_method,
        description=data.description,
        notes=data.notes,
        created_by_id=current_user.id,
    )
    return LedgerEntryResponse(
        id=entry.id,
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/{agreement_id}/adjustments", response_model=LedgerEntryResponse, status_code=201)
async def post_adjustment(
    agreement_id: int,
    data: PostAdjustmentRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_ADJUSTMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Post an adjustment to the ledger."""
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
        agreement_id=entry.agreement_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        payment_method=entry.payment_method,
        payment_reference=entry.payment_reference,
        notes=entry.notes,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at.isoformat(),
        created_by_id=entry.created_by_id,
    )


@router.post("/entries/{entry_id}/reverse", response_model=LedgerEntryResponse, status_code=201)
async def reverse_entry(
    entry_id: int,
    data: ReverseEntryRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.POST_ADJUSTMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Reverse a ledger entry."""
    try:
        entry = ledger_service.reverse_entry(
            db=db,
            entry_id=entry_id,
            reason=data.reason,
            created_by_id=current_user.id,
        )
        return LedgerEntryResponse(
            id=entry.id,
            agreement_id=entry.agreement_id,
            entry_type=entry.entry_type,
            amount=entry.amount,
            description=entry.description,
            payment_method=entry.payment_method,
            payment_reference=entry.payment_reference,
            notes=entry.notes,
            reversed_entry_id=entry.reversed_entry_id,
            created_at=entry.created_at.isoformat(),
            created_by_id=entry.created_by_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
