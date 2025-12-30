"""Collateral Persons API router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from src.api.deps import get_db, require_permission
from src.core.rbac import Permission
from src.models.collateral_person import CollateralPerson
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.schemas.collateral_person import (
    CollateralPersonCreate,
    CollateralPersonListResponse,
    CollateralPersonResponse,
    CollateralPersonUpdate,
)

router = APIRouter()


@router.get("", response_model=CollateralPersonListResponse)
async def list_collateral_persons(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None, description="Filter by customer ID"),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """List collateral persons with pagination and filters."""
    query = db.query(CollateralPerson).options(joinedload(CollateralPerson.customer))
    
    if customer_id is not None:
        query = query.filter(CollateralPerson.customer_id == customer_id)
    
    if is_active is not None:
        query = query.filter(CollateralPerson.is_active == is_active)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                CollateralPerson.first_name.ilike(search_filter),
                CollateralPerson.last_name.ilike(search_filter),
                CollateralPerson.phone_primary.ilike(search_filter),
                CollateralPerson.id_number.ilike(search_filter),
            )
        )
    
    total = query.count()
    pages = (total + page_size - 1) // page_size
    
    collaterals = (
        query.order_by(CollateralPerson.first_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    return CollateralPersonListResponse(
        items=collaterals,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{collateral_id}", response_model=CollateralPersonResponse)
async def get_collateral_person(
    collateral_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Get a collateral person by ID."""
    collateral = (
        db.query(CollateralPerson)
        .options(joinedload(CollateralPerson.customer))
        .filter(CollateralPerson.id == collateral_id)
        .first()
    )
    if not collateral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collateral person not found",
        )
    return collateral


@router.post("", response_model=CollateralPersonResponse, status_code=status.HTTP_201_CREATED)
async def create_collateral_person(
    data: CollateralPersonCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Create a new collateral person linked to a customer."""
    # Verify customer exists
    customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    
    collateral = CollateralPerson(
        customer_id=data.customer_id,
        first_name=data.first_name,
        last_name=data.last_name,
        phone_primary=data.phone_primary,
        phone_secondary=data.phone_secondary,
        email=data.email,
        relationship_to_customer=data.relationship_to_customer,
        id_type=data.id_type,
        id_number=data.id_number,
        house_number=data.house_number,
        wereda=data.wereda,
        subcity=data.subcity,
        city=data.city,
        occupation=data.occupation,
        employer_name=data.employer_name,
        employer_phone=data.employer_phone,
        notes=data.notes,
    )
    
    db.add(collateral)
    db.commit()
    db.refresh(collateral)
    
    # Load customer relationship
    db.refresh(collateral, ["customer"])
    return collateral


@router.put("/{collateral_id}", response_model=CollateralPersonResponse)
async def update_collateral_person(
    collateral_id: int,
    data: CollateralPersonUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Update a collateral person."""
    collateral = (
        db.query(CollateralPerson)
        .options(joinedload(CollateralPerson.customer))
        .filter(CollateralPerson.id == collateral_id)
        .first()
    )
    if not collateral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collateral person not found",
        )
    
    update_data = data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(collateral, field, value)
    
    db.commit()
    db.refresh(collateral)
    return collateral


@router.delete("/{collateral_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collateral_person(
    collateral_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Delete a collateral person (soft delete by setting is_active=False)."""
    collateral = db.query(CollateralPerson).filter(CollateralPerson.id == collateral_id).first()
    if not collateral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collateral person not found",
        )
    
    collateral.is_active = False
    db.commit()
    return None
