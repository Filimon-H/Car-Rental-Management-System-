"""Drivers API router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_permission
from src.core.rbac import Permission
from src.models.driver import Driver
from src.models.staff_user import StaffUser
from src.schemas.driver import (
    DriverCreate,
    DriverListResponse,
    DriverResponse,
    DriverUpdate,
)

router = APIRouter()


@router.get("", response_model=DriverListResponse)
async def list_drivers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """List drivers with pagination and filters."""
    query = db.query(Driver)
    
    if is_active is not None:
        query = query.filter(Driver.is_active == is_active)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Driver.first_name.ilike(search_filter),
                Driver.last_name.ilike(search_filter),
                Driver.phone_primary.ilike(search_filter),
                Driver.license_number.ilike(search_filter),
            )
        )
    
    total = query.count()
    pages = (total + page_size - 1) // page_size
    
    drivers = (
        query.order_by(Driver.first_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    return DriverListResponse(
        items=drivers,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{driver_id}", response_model=DriverResponse)
async def get_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Get a driver by ID."""
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found",
        )
    return driver


@router.post("", response_model=DriverResponse, status_code=status.HTTP_201_CREATED)
async def create_driver(
    data: DriverCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Create a new driver."""
    # Check for duplicate license number
    existing = db.query(Driver).filter(Driver.license_number == data.license_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver with this license number already exists",
        )
    
    driver = Driver(
        first_name=data.first_name,
        last_name=data.last_name,
        phone_primary=data.phone_primary,
        phone_secondary=data.phone_secondary,
        email=data.email,
        id_type=data.id_type,
        id_number=data.id_number,
        license_number=data.license_number,
        license_expiry=data.license_expiry,
        license_class=data.license_class,
        house_number=data.house_number,
        wereda=data.wereda,
        subcity=data.subcity,
        city=data.city,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
        notes=data.notes,
    )
    
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.put("/{driver_id}", response_model=DriverResponse)
async def update_driver(
    driver_id: int,
    data: DriverUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Update a driver."""
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found",
        )
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Check for duplicate license number if being updated
    if "license_number" in update_data and update_data["license_number"] != driver.license_number:
        existing = db.query(Driver).filter(Driver.license_number == update_data["license_number"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver with this license number already exists",
            )
    
    for field, value in update_data.items():
        setattr(driver, field, value)
    
    db.commit()
    db.refresh(driver)
    return driver


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Delete a driver (soft delete by setting is_active=False)."""
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found",
        )
    
    driver.is_active = False
    db.commit()
    return None
