"""API routes for lookup values (admin-managed dropdown options)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.deps.auth import require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.staff_user import StaffUser
from src.models.lookup import LookupValue
from src.schemas.lookup import (
    LookupValueCreate,
    LookupValueUpdate,
    LookupValueResponse,
    LookupCategoryResponse,
)

router = APIRouter()


@router.get("/categories", response_model=list[str])
async def list_categories(
    db: Session = Depends(get_db),
):
    """List all lookup categories."""
    categories = db.query(LookupValue.category).distinct().all()
    return [c[0] for c in categories]


@router.get("/category/{category}", response_model=list[LookupValueResponse])
async def get_category_values(
    category: str,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """Get all values for a specific category."""
    query = db.query(LookupValue).filter(LookupValue.category == category)
    if not include_inactive:
        query = query.filter(LookupValue.is_active == True)
    values = query.order_by(LookupValue.sort_order, LookupValue.value).all()
    return values


@router.get("/defaults", response_model=dict)
async def get_default_lookups(
    db: Session = Depends(get_db),
):
    """
    Get all default lookup values for vehicle form dropdowns.
    Returns a dict with category as key and list of values.
    """
    categories = [
        "car_model",
        "color",
        "vehicle_type",
        "service_type",
        "plate_code",
        "plate_city",
        "make",
        "fuel_type",
        "car_condition",
    ]
    result = {}
    
    for category in categories:
        values = (
            db.query(LookupValue)
            .filter(LookupValue.category == category, LookupValue.is_active == True)
            .order_by(LookupValue.sort_order, LookupValue.value)
            .all()
        )
        result[category] = [{"value": v.value, "label": v.label or v.value} for v in values]
    
    return result


@router.post("", response_model=LookupValueResponse, status_code=status.HTTP_201_CREATED)
async def create_lookup_value(
    data: LookupValueCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Create a new lookup value (Admin only)."""
    # Check for duplicate
    existing = (
        db.query(LookupValue)
        .filter(LookupValue.category == data.category, LookupValue.value == data.value)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Value '{data.value}' already exists in category '{data.category}'",
        )
    
    lookup = LookupValue(**data.model_dump())
    db.add(lookup)
    db.commit()
    db.refresh(lookup)
    return lookup


@router.put("/{lookup_id}", response_model=LookupValueResponse)
async def update_lookup_value(
    lookup_id: int,
    data: LookupValueUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Update a lookup value (Admin only)."""
    lookup = db.query(LookupValue).filter(LookupValue.id == lookup_id).first()
    if not lookup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lookup value not found",
        )
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(lookup, field, value)
    
    db.commit()
    db.refresh(lookup)
    return lookup


@router.delete("/{lookup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lookup_value(
    lookup_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Delete a lookup value (Admin only)."""
    lookup = db.query(LookupValue).filter(LookupValue.id == lookup_id).first()
    if not lookup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lookup value not found",
        )
    
    db.delete(lookup)
    db.commit()
