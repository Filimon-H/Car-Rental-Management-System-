"""Vendors API router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.models.vendor import Vendor
from src.models.staff_user import StaffUser
from src.schemas.vendor import (
    VendorCreate,
    VendorPayableSummaryResponse,
    VendorPaymentCreate,
    VendorPaymentResponse,
    VendorListResponse,
    VendorResponse,
    VendorSearchResult,
    VendorUpdate,
)
from src.services import vendor_service

router = APIRouter()


@router.get("", response_model=VendorListResponse)
async def list_vendors(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VENDORS)),
):
    """List vendors with pagination and optional search."""
    query = db.query(Vendor)
    
    # Filter by active status
    if is_active is not None:
        query = query.filter(Vendor.is_active == is_active)
    
    # Search by company name, contact person, or phone
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Vendor.company_name.ilike(search_term),
                Vendor.contact_person.ilike(search_term),
                Vendor.phone_primary.ilike(search_term),
            )
        )
    
    # Get total count
    total = query.count()
    
    # Paginate
    offset = (page - 1) * page_size
    vendors = query.order_by(Vendor.company_name).offset(offset).limit(page_size).all()
    
    return VendorListResponse(
        items=[VendorResponse.model_validate(v) for v in vendors],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/search", response_model=list[VendorSearchResult])
async def search_vendors(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VENDORS)),
):
    """Quick search for vendor lookup modal."""
    search_term = f"%{q}%"
    vendors = (
        db.query(Vendor)
        .filter(Vendor.is_active == True)
        .filter(
            or_(
                Vendor.company_name.ilike(search_term),
                Vendor.contact_person.ilike(search_term),
                Vendor.phone_primary.ilike(search_term),
            )
        )
        .order_by(Vendor.company_name)
        .limit(limit)
        .all()
    )
    
    return [VendorSearchResult.model_validate(v) for v in vendors]


@router.get("/{vendor_id}", response_model=VendorResponse)
async def get_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VENDORS)),
):
    """Get a single vendor by ID."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found",
        )
    return VendorResponse.model_validate(vendor)


@router.get("/{vendor_id}/summary", response_model=VendorPayableSummaryResponse)
async def get_vendor_summary(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VENDORS)),
):
    """Get vendor payable summary based on vehicle usage."""
    summary = vendor_service.get_vendor_payable_summary(db, vendor_id)
    return VendorPayableSummaryResponse(**summary)


@router.get("/{vendor_id}/payments", response_model=list[VendorPaymentResponse])
async def get_vendor_payments(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VENDORS)),
):
    """List payments made to a vendor."""
    payments = vendor_service.list_vendor_payments(db, vendor_id)
    return [VendorPaymentResponse.model_validate(payment) for payment in payments]


@router.post("/{vendor_id}/payments", response_model=VendorPaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_vendor_payment(
    vendor_id: int,
    data: VendorPaymentCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.POST_PAYMENTS)),
):
    """Record a payment made to a vendor."""
    payment = vendor_service.post_vendor_payment(
        db=db,
        vendor_id=vendor_id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_reference=data.payment_reference,
        notes=data.notes,
        agreement_id=data.agreement_id,
        created_by_id=current_user.id,
    )
    return VendorPaymentResponse.model_validate(payment)


@router.post("", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    data: VendorCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VENDORS)),
):
    """Create a new vendor."""
    vendor = Vendor(**data.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    
    return VendorResponse.model_validate(vendor)


@router.put("/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: int,
    data: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VENDORS)),
):
    """Update an existing vendor."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found",
        )
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vendor, field, value)
    
    db.commit()
    db.refresh(vendor)
    
    return VendorResponse.model_validate(vendor)


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VENDORS)),
):
    """Soft-delete a vendor (mark as inactive)."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found",
        )
    
    vendor.is_active = False
    db.commit()
    
    return None
