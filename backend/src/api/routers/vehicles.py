"""Vehicles API router."""

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.models.vehicle import Vehicle, VehicleStatus
from src.models.staff_user import StaffUser
from src.core.storage import storage_service
from src.schemas.vehicle import (
    VehicleCreate,
    VehicleListResponse,
    VehicleResponse,
    VehicleSearchResult,
    VehicleStatusUpdate,
    VehicleUpdate,
)

router = APIRouter()


@router.get("", response_model=VehicleListResponse)
async def list_vehicles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[VehicleStatus] = Query(None),
    vehicle_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VEHICLES)),
):
    """List vehicles with pagination and filters."""
    query = db.query(Vehicle)
    
    # Filter by active status
    if is_active is not None:
        query = query.filter(Vehicle.is_active == is_active)
    
    # Filter by vehicle status
    if status:
        query = query.filter(Vehicle.status == status)
    
    # Filter by vehicle type
    if vehicle_type:
        query = query.filter(Vehicle.vehicle_type == vehicle_type)
    
    # Search by plate, make, model
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Vehicle.plate_number.ilike(search_term),
                Vehicle.make.ilike(search_term),
                Vehicle.model.ilike(search_term),
            )
        )
    
    # Get total count
    total = query.count()
    
    # Paginate
    offset = (page - 1) * page_size
    vehicles = query.order_by(Vehicle.plate_number).offset(offset).limit(page_size).all()
    
    return VehicleListResponse(
        items=[VehicleResponse.model_validate(v) for v in vehicles],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/search", response_model=list[VehicleSearchResult])
async def search_vehicles(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    available_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VEHICLES)),
):
    """Quick search for vehicle lookup modal."""
    search_term = f"%{q}%"
    query = (
        db.query(Vehicle)
        .filter(Vehicle.is_active == True)
        .filter(
            or_(
                Vehicle.plate_number.ilike(search_term),
                Vehicle.make.ilike(search_term),
                Vehicle.model.ilike(search_term),
            )
        )
    )
    
    if available_only:
        query = query.filter(Vehicle.status == VehicleStatus.AVAILABLE)
    
    vehicles = query.order_by(Vehicle.plate_number).limit(limit).all()
    
    return [VehicleSearchResult.model_validate(v) for v in vehicles]


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_VEHICLES)),
):
    """Get a single vehicle by ID."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    return VehicleResponse.model_validate(vehicle)


@router.post("/{vehicle_id}/photos", response_model=VehicleResponse)
async def upload_vehicle_photos(
    vehicle_id: int,
    front: UploadFile | None = File(None),
    back: UploadFile | None = File(None),
    left: UploadFile | None = File(None),
    right: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VEHICLES)),
):
    """Upload optional vehicle photos (front/back/left/right)."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    uploads: list[tuple[str, UploadFile]] = []
    if front is not None:
        uploads.append(("front", front))
    if back is not None:
        uploads.append(("back", back))
    if left is not None:
        uploads.append(("left", left))
    if right is not None:
        uploads.append(("right", right))

    for kind, file in uploads:
        relative_path = storage_service.save_vehicle_photo(
            file=file.file,
            original_filename=file.filename or f"{kind}.jpg",
            vehicle_id=vehicle.id,
            photo_kind=kind,
        )
        setattr(vehicle, f"photo_{kind}", relative_path)

    db.commit()
    db.refresh(vehicle)
    return VehicleResponse.model_validate(vehicle)


@router.post("", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VEHICLES)),
):
    """Create a new vehicle."""
    # Check for duplicate plate number
    existing = db.query(Vehicle).filter(Vehicle.plate_number == data.plate_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vehicle with this plate number already exists",
        )
    
    # Verify vendor exists
    from src.models.vendor import Vendor
    vendor = db.query(Vendor).filter(Vendor.id == data.vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vendor not found",
        )
    
    # Map schema fields to model fields
    vehicle_data = {
        "vendor_id": data.vendor_id,
        "plate_number": data.plate_number,
        "plate_code": data.plate_code,
        "plate_city": data.plate_city,
        "make": data.make,
        "model": data.model,
        "year": data.year,
        "color": data.color,
        "vehicle_type": data.vehicle_type,
        "service_type": data.service_type,
        "car_condition": data.car_condition,
        "motor_number": data.motor_number,
        "chassis_number": data.chassis_number,
        "seats": data.seats,
        "transmission": data.transmission,
        "fuel_type": data.fuel_type,
        "daily_rate": data.daily_rate,
        "insurance_policy": data.insurance_policy_number,
        "insurance_expiry": data.insurance_expiry,
        "current_mileage": data.current_mileage or 0,
        "notes": data.notes,
    }
    vehicle = Vehicle(**{k: v for k, v in vehicle_data.items() if v is not None})
    vehicle.status = VehicleStatus.AVAILABLE
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    
    return VehicleResponse.model_validate(vehicle)


@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: int,
    data: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VEHICLES)),
):
    """Update an existing vehicle."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    
    # Check for duplicate plate number if being changed
    if data.plate_number and data.plate_number != vehicle.plate_number:
        existing = db.query(Vehicle).filter(
            Vehicle.plate_number == data.plate_number,
            Vehicle.id != vehicle_id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle with this plate number already exists",
            )
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)

    # Map API field name to model field name
    if "insurance_policy_number" in update_data:
        vehicle.insurance_policy = update_data.pop("insurance_policy_number")

    for field, value in update_data.items():
        setattr(vehicle, field, value)
    
    db.commit()
    db.refresh(vehicle)
    
    return VehicleResponse.model_validate(vehicle)


@router.patch("/{vehicle_id}/status", response_model=VehicleResponse)
async def update_vehicle_status(
    vehicle_id: int,
    data: VehicleStatusUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VEHICLES)),
):
    """Update vehicle status (available, maintenance, retired, etc.)."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    
    # Cannot change status if currently rented
    if vehicle.status == VehicleStatus.RENTED and data.status != VehicleStatus.RENTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change status of a rented vehicle. Close the agreement first.",
        )
    
    vehicle.status = data.status
    if data.notes:
        vehicle.notes = data.notes
    
    db.commit()
    db.refresh(vehicle)
    
    return VehicleResponse.model_validate(vehicle)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_VEHICLES)),
):
    """Soft-delete a vehicle (mark as inactive)."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    
    # Cannot delete if currently rented
    if vehicle.status == VehicleStatus.RENTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a rented vehicle. Close the agreement first.",
        )
    
    vehicle.is_active = False
    db.commit()
    
    return None
