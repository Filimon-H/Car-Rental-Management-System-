"""Inspections API router."""

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.models.inspection import Inspection, InspectionPhoto
from src.models.inspection_template import InspectionTemplate

router = APIRouter()


# Schemas
class ChecklistItemResult(BaseModel):
    status: str  # ok, damage, na
    notes: Optional[str] = None
    photos: list[str] = []


class DamageRecord(BaseModel):
    id: str
    category: str
    location: str
    severity: str  # minor, moderate, severe
    description: Optional[str] = None
    photos: list[str] = []
    estimated_cost: float = 0


class InspectionCreate(BaseModel):
    template_id: Optional[int] = None
    agreement_id: Optional[int] = None
    vehicle_id: int
    inspection_type: str = Field(..., pattern="^(pickup|return|periodic|damage_report)$")
    inspection_datetime: datetime
    mileage: Optional[int] = None
    fuel_level: Optional[float] = None
    checklist_results: dict[str, ChecklistItemResult] = {}
    damage_records: list[DamageRecord] = []
    condition_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


class InspectionUpdate(BaseModel):
    mileage: Optional[int] = None
    fuel_level: Optional[float] = None
    checklist_results: Optional[dict[str, ChecklistItemResult]] = None
    damage_records: Optional[list[DamageRecord]] = None
    condition_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None
    customer_name: Optional[str] = None
    customer_signature: Optional[str] = None


class InspectionResponse(BaseModel):
    id: int
    template_id: Optional[int]
    agreement_id: Optional[int]
    vehicle_id: int
    inspection_type: str
    inspection_datetime: datetime
    inspector_id: Optional[int]
    inspector_name: Optional[str]
    customer_name: Optional[str]
    mileage: Optional[int]
    fuel_level: Optional[float]
    checklist_results: dict
    damage_records: list
    condition_rating: Optional[int]
    notes: Optional[str]
    status: str
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class InspectionListResponse(BaseModel):
    items: list[InspectionResponse]
    total: int
    page: int
    page_size: int


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    template_type: str
    checklist_items: list
    damage_categories: list
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Template endpoints
@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
    active_only: bool = Query(True),
):
    """List inspection templates."""
    query = db.query(InspectionTemplate)
    if active_only:
        query = query.filter(InspectionTemplate.is_active == True)
    templates = query.order_by(InspectionTemplate.name).all()
    return [TemplateResponse.model_validate(t) for t in templates]


@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Get a single inspection template."""
    template = db.query(InspectionTemplate).filter(InspectionTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateResponse.model_validate(template)


# Inspection endpoints
@router.get("", response_model=InspectionListResponse)
async def list_inspections(
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    vehicle_id: Optional[int] = None,
    agreement_id: Optional[int] = None,
    inspection_type: Optional[str] = None,
    status: Optional[str] = None,
):
    """List inspections with filters."""
    query = db.query(Inspection)
    
    if vehicle_id:
        query = query.filter(Inspection.vehicle_id == vehicle_id)
    if agreement_id:
        query = query.filter(Inspection.agreement_id == agreement_id)
    if inspection_type:
        query = query.filter(Inspection.inspection_type == inspection_type)
    if status:
        query = query.filter(Inspection.status == status)
    
    total = query.count()
    offset = (page - 1) * page_size
    inspections = query.order_by(Inspection.created_at.desc()).offset(offset).limit(page_size).all()
    
    return InspectionListResponse(
        items=[InspectionResponse.model_validate(i) for i in inspections],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{inspection_id}", response_model=InspectionResponse)
async def get_inspection(
    inspection_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Get a single inspection."""
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return InspectionResponse.model_validate(inspection)


@router.post("", response_model=InspectionResponse, status_code=201)
async def create_inspection(
    data: InspectionCreate,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.CREATE_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Create a new inspection."""
    inspection = Inspection(
        template_id=data.template_id,
        agreement_id=data.agreement_id,
        vehicle_id=data.vehicle_id,
        inspection_type=data.inspection_type,
        inspection_datetime=data.inspection_datetime,
        inspector_id=current_user.id,
        inspector_name=current_user.full_name,
        mileage=data.mileage,
        fuel_level=data.fuel_level,
        checklist_results={k: v.model_dump() for k, v in data.checklist_results.items()},
        damage_records=[d.model_dump() for d in data.damage_records],
        condition_rating=data.condition_rating,
        notes=data.notes,
        status="draft",
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    
    return InspectionResponse.model_validate(inspection)


@router.put("/{inspection_id}", response_model=InspectionResponse)
async def update_inspection(
    inspection_id: int,
    data: InspectionUpdate,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Update an inspection."""
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    if inspection.status == "signed":
        raise HTTPException(status_code=400, detail="Cannot modify a signed inspection")
    
    update_data = data.model_dump(exclude_unset=True)
    
    if "checklist_results" in update_data and update_data["checklist_results"]:
        update_data["checklist_results"] = {
            k: v.model_dump() if hasattr(v, 'model_dump') else v 
            for k, v in update_data["checklist_results"].items()
        }
    
    if "damage_records" in update_data and update_data["damage_records"]:
        update_data["damage_records"] = [
            d.model_dump() if hasattr(d, 'model_dump') else d 
            for d in update_data["damage_records"]
        ]
    
    for field, value in update_data.items():
        setattr(inspection, field, value)
    
    db.commit()
    db.refresh(inspection)
    
    return InspectionResponse.model_validate(inspection)


@router.post("/{inspection_id}/complete", response_model=InspectionResponse)
async def complete_inspection(
    inspection_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark an inspection as completed."""
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    if inspection.status == "signed":
        raise HTTPException(status_code=400, detail="Inspection already signed")
    
    inspection.status = "completed"
    inspection.completed_at = datetime.now()
    db.commit()
    db.refresh(inspection)
    
    return InspectionResponse.model_validate(inspection)


class SignInspectionRequest(BaseModel):
    customer_name: str
    customer_signature: Optional[str] = None


@router.post("/{inspection_id}/sign", response_model=InspectionResponse)
async def sign_inspection(
    inspection_id: int,
    data: SignInspectionRequest,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Sign an inspection with customer signature."""
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    inspection.status = "signed"
    inspection.customer_name = data.customer_name
    inspection.customer_signature = data.customer_signature
    if not inspection.completed_at:
        inspection.completed_at = datetime.now()
    
    db.commit()
    db.refresh(inspection)
    
    return InspectionResponse.model_validate(inspection)
