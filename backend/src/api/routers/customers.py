"""Customers API router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    CustomerSearchResult,
    CustomerUpdate,
)

router = APIRouter()


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """List customers with pagination and optional search."""
    query = db.query(Customer)
    
    # Filter by active status
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    
    # Search by name, phone, or ID number
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Customer.first_name.ilike(search_term),
                Customer.last_name.ilike(search_term),
                Customer.phone_primary.ilike(search_term),
                Customer.id_number.ilike(search_term),
            )
        )
    
    # Get total count
    total = query.count()
    
    # Paginate
    offset = (page - 1) * page_size
    customers = query.order_by(Customer.first_name, Customer.last_name).offset(offset).limit(page_size).all()
    
    return CustomerListResponse(
        items=[CustomerResponse.model_validate(c) for c in customers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/search", response_model=list[CustomerSearchResult])
async def search_customers(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Quick search for customer lookup modal."""
    search_term = f"%{q}%"
    customers = (
        db.query(Customer)
        .filter(Customer.is_active == True)
        .filter(
            or_(
                Customer.first_name.ilike(search_term),
                Customer.last_name.ilike(search_term),
                Customer.phone_primary.ilike(search_term),
                Customer.id_number.ilike(search_term),
            )
        )
        .order_by(Customer.first_name, Customer.last_name)
        .limit(limit)
        .all()
    )
    
    return [CustomerSearchResult.model_validate(c) for c in customers]


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Get a single customer by ID."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return CustomerResponse.model_validate(customer)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Create a new customer."""
    # Check for duplicate ID number
    existing = db.query(Customer).filter(Customer.id_number == data.id_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer with this ID number already exists",
        )
    
    # Map schema fields to model fields
    customer_data = {
        "business_type": data.business_type,
        "company_name": data.company_name,
        "tin_number": data.tin_number,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "phone_primary": data.phone_primary,
        "phone_secondary": data.phone_secondary,
        "email": data.email,
        "id_type": data.id_type,
        "id_number": data.id_number,
        "id_expiry": data.id_expiry_date,
        "license_number": data.driver_license_number,
        "license_expiry": data.driver_license_expiry,
        "house_number": data.house_number,
        "wereda": data.wereda,
        "subcity": data.subcity,
        "city": data.city,
        "emergency_contact_name": data.emergency_contact_name,
        "emergency_contact_phone": data.emergency_contact_phone,
        "notes": data.notes,
    }
    customer = Customer(**{k: v for k, v in customer_data.items() if v is not None})
    db.add(customer)
    db.commit()
    db.refresh(customer)
    
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Update an existing customer."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    
    # Check for duplicate ID number if being changed
    if data.id_number and data.id_number != customer.id_number:
        existing = db.query(Customer).filter(
            Customer.id_number == data.id_number,
            Customer.id != customer_id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer with this ID number already exists",
            )
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
    
    db.commit()
    db.refresh(customer)
    
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Soft-delete a customer (mark as inactive)."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    
    customer.is_active = False
    db.commit()
    
    return None
