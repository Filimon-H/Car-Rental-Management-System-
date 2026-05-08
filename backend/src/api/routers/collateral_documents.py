"""Collateral documents API router for file uploads."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_permission
from src.core.rbac import Permission
from src.models.collateral_document import CollateralDocument
from src.models.collateral_person import CollateralPerson
from src.models.customer_document import DocumentType
from src.models.staff_user import StaffUser
from src.schemas.collateral_document import (
    CollateralDocumentListResponse,
    CollateralDocumentResponse,
)

router = APIRouter()

UPLOAD_DIR = Path("uploads/collateral_documents")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024


def ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def ensure_upload_subdir(doc_type: DocumentType) -> Path:
    ensure_upload_dir()
    subdir = UPLOAD_DIR / doc_type.value
    subdir.mkdir(parents=True, exist_ok=True)
    return subdir


def validate_file(file: UploadFile) -> tuple[str, str]:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content_type = file.content_type or "application/octet-stream"
    allowed_mimes = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if content_type not in allowed_mimes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content type not allowed: {content_type}",
        )

    return ext, content_type


@router.get("/{collateral_id}/documents", response_model=CollateralDocumentListResponse)
async def list_collateral_documents(
    collateral_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    collateral = db.query(CollateralPerson).filter(CollateralPerson.id == collateral_id).first()
    if not collateral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collateral person not found")

    documents = (
        db.query(CollateralDocument)
        .filter(CollateralDocument.collateral_id == collateral_id)
        .order_by(CollateralDocument.created_at.desc())
        .all()
    )

    return CollateralDocumentListResponse(
        items=[CollateralDocumentResponse.model_validate(d) for d in documents],
        total=len(documents),
    )


@router.post(
    "/{collateral_id}/documents",
    response_model=CollateralDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_collateral_document(
    collateral_id: int,
    doc_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    collateral = db.query(CollateralPerson).filter(CollateralPerson.id == collateral_id).first()
    if not collateral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collateral person not found")

    ext, mime_type = validate_file(file)

    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB",
        )

    unique_id = uuid.uuid4().hex[:12]
    safe_filename = f"{collateral_id}_{doc_type.value}_{unique_id}{ext}"

    upload_dir = ensure_upload_subdir(doc_type)
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    document = CollateralDocument(
        collateral_id=collateral_id,
        doc_type=doc_type,
        file_name=file.filename,
        file_path=str(file_path),
        file_size=file_size,
        mime_type=mime_type,
        uploaded_by_id=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    return CollateralDocumentResponse.model_validate(document)


@router.get("/{collateral_id}/documents/{document_id}/file")
async def get_collateral_document_file(
    collateral_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    collateral = db.query(CollateralPerson).filter(CollateralPerson.id == collateral_id).first()
    if not collateral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collateral person not found")

    document = (
        db.query(CollateralDocument)
        .filter(
            CollateralDocument.id == document_id,
            CollateralDocument.collateral_id == collateral_id,
        )
        .first()
    )

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(path=document.file_path, filename=document.file_name, media_type=document.mime_type)


@router.delete("/{collateral_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collateral_document(
    collateral_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    document = (
        db.query(CollateralDocument)
        .filter(
            CollateralDocument.id == document_id,
            CollateralDocument.collateral_id == collateral_id,
        )
        .first()
    )

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
    except Exception:
        pass

    db.delete(document)
    db.commit()

    return None
