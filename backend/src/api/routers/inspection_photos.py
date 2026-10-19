"""Photos attached to an inspection.

The inspection_photos table has existed since the inspections feature, but
nothing could write to it, so an inspector recording a scratch had no way to
attach the picture that proves it. Damage disputes are settled on those
photos.

Files are stored outside the public /api/uploads mount and served only
through the authenticated endpoint below: they show customers' cars, and
often the customers themselves, so they are not public.

Photos follow the inspection's own edit rule: they can be added or removed
until the inspection is signed, after which it is evidence and is locked.
"""

import os
import uuid
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.core.upload_validation import describe_content, extension_matches_content, is_real_image
from src.models.inspection import Inspection, InspectionPhoto

router = APIRouter()

# Alongside customer documents, not under the public static mount.
UPLOAD_DIR = Path("uploads/inspection_photos")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MIME_BY_EXTENSION = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_PHOTOS_PER_INSPECTION = 40
CATEGORIES = {"exterior", "interior", "damage", "document", "other"}


class InspectionPhotoResponse(BaseModel):
    id: int
    inspection_id: int
    filename: str
    file_size: Optional[int]
    mime_type: Optional[str]
    caption: Optional[str]
    category: Optional[str]
    checklist_item_id: Optional[str]
    damage_record_id: Optional[str]
    created_at: str

    @classmethod
    def from_photo(cls, p: InspectionPhoto) -> "InspectionPhotoResponse":
        return cls(
            id=p.id,
            inspection_id=p.inspection_id,
            filename=p.filename,
            file_size=p.file_size,
            mime_type=p.mime_type,
            caption=p.caption,
            category=p.category,
            checklist_item_id=p.checklist_item_id,
            damage_record_id=p.damage_record_id,
            created_at=p.created_at.isoformat() if p.created_at else "",
        )


def _get_inspection(db: Session, inspection_id: int) -> Inspection:
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return inspection


def _require_editable(inspection: Inspection) -> None:
    if inspection.status == "signed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This inspection is signed; its photos can no longer be changed",
        )


def _get_photo(db: Session, inspection_id: int, photo_id: int) -> InspectionPhoto:
    photo = (
        db.query(InspectionPhoto)
        .filter(InspectionPhoto.id == photo_id, InspectionPhoto.inspection_id == inspection_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return photo


def _display_name(filename: str) -> str:
    base = Path(filename).name
    cleaned = "".join(c for c in base if c not in '\r\n"\\;').strip()
    return cleaned[:255] or "photo"


@router.get("/{inspection_id}/photos", response_model=list[InspectionPhotoResponse])
async def list_photos(
    inspection_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
) -> list[InspectionPhotoResponse]:
    _get_inspection(db, inspection_id)
    photos = (
        db.query(InspectionPhoto)
        .filter(InspectionPhoto.inspection_id == inspection_id)
        .order_by(InspectionPhoto.id)
        .all()
    )
    return [InspectionPhotoResponse.from_photo(p) for p in photos]


@router.post(
    "/{inspection_id}/photos",
    response_model=InspectionPhotoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    inspection_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    checklist_item_id: Optional[str] = Form(None),
    damage_record_id: Optional[str] = Form(None),
) -> InspectionPhotoResponse:
    inspection = _get_inspection(db, inspection_id)
    _require_editable(inspection)

    if category is not None and category not in CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown category. Allowed: {', '.join(sorted(CATEGORIES))}",
        )

    existing = db.query(InspectionPhoto).filter(InspectionPhoto.inspection_id == inspection_id).count()
    if existing >= MAX_PHOTOS_PER_INSPECTION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An inspection can hold at most {MAX_PHOTOS_PER_INSPECTION} photos",
        )

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only photos can be attached: JPEG, PNG or WebP",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Photo too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )
    # The extension and Content-Type are caller-supplied; check the bytes.
    if not is_real_image(content) or not extension_matches_content(file.filename, content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File is not a valid photo (detected: {describe_content(content)})",
        )

    target_dir = UPLOAD_DIR / str(inspection_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    stored = target_dir / f"{uuid.uuid4().hex}{ext}"
    with open(stored, "wb") as f:
        f.write(content)

    photo = InspectionPhoto(
        inspection_id=inspection_id,
        filename=_display_name(file.filename),
        file_path=str(stored),
        file_size=len(content),
        mime_type=MIME_BY_EXTENSION[ext],
        caption=(caption or "").strip()[:255] or None,
        category=category,
        checklist_item_id=(checklist_item_id or "").strip()[:50] or None,
        damage_record_id=(damage_record_id or "").strip()[:50] or None,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return InspectionPhotoResponse.from_photo(photo)


@router.get("/{inspection_id}/photos/{photo_id}/file")
async def get_photo_file(
    inspection_id: int,
    photo_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.VIEW_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
):
    photo = _get_photo(db, inspection_id, photo_id)
    if not os.path.exists(photo.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(
        path=photo.file_path,
        filename=photo.filename,
        media_type=photo.mime_type or "application/octet-stream",
        content_disposition_type="inline",
    )


@router.delete("/{inspection_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    inspection_id: int,
    photo_id: int,
    _current_user: Annotated[CurrentUser, Depends(require_permission(Permission.MANAGE_INSPECTIONS))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    inspection = _get_inspection(db, inspection_id)
    _require_editable(inspection)
    photo = _get_photo(db, inspection_id, photo_id)
    path = photo.file_path
    db.delete(photo)
    db.commit()
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        # The record is gone, which is what users see; a stray file is harmless.
        pass
