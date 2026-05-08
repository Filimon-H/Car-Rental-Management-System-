"""Customer documents API router for file uploads."""

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.models.customer import Customer
from src.models.customer_document import CustomerDocument, DocumentType
from src.models.staff_user import StaffUser
from src.schemas.customer_document import (
    CustomerDocumentListResponse,
    CustomerDocumentResponse,
)

router = APIRouter()

# Upload directory - in production, use cloud storage like S3
UPLOAD_DIR = Path("uploads/customer_documents")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def ensure_upload_dir():
    """Ensure upload directory exists."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def ensure_upload_subdir(doc_type: DocumentType) -> Path:
    """Ensure per-document-type subdirectory exists and return it."""
    ensure_upload_dir()
    subdir = UPLOAD_DIR / doc_type.value
    subdir.mkdir(parents=True, exist_ok=True)
    return subdir


def validate_file(file: UploadFile) -> tuple[str, str]:
    """Validate uploaded file and return (extension, mime_type)."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Check content type
    content_type = file.content_type or "application/octet-stream"
    allowed_mimes = {
        "image/jpeg", "image/png", "image/webp", "application/pdf"
    }
    if content_type not in allowed_mimes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content type not allowed: {content_type}"
        )
    
    return ext, content_type


@router.get("/{customer_id}/documents", response_model=CustomerDocumentListResponse)
async def list_customer_documents(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """List all documents for a customer."""
    # Verify customer exists
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    documents = db.query(CustomerDocument).filter(
        CustomerDocument.customer_id == customer_id
    ).order_by(CustomerDocument.created_at.desc()).all()
    
    return CustomerDocumentListResponse(
        items=[CustomerDocumentResponse.model_validate(d) for d in documents],
        total=len(documents)
    )


@router.post("/{customer_id}/documents", response_model=CustomerDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_customer_document(
    customer_id: int,
    doc_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Upload a document for a customer."""
    # Verify customer exists
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Validate file
    ext, mime_type = validate_file(file)
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Generate unique filename
    unique_id = uuid.uuid4().hex[:12]
    safe_filename = f"{customer_id}_{doc_type.value}_{unique_id}{ext}"
    
    # Ensure upload directory exists (per doc type)
    upload_dir = ensure_upload_subdir(doc_type)
    
    # Save file
    file_path = upload_dir / safe_filename
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Create database record
    document = CustomerDocument(
        customer_id=customer_id,
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
    
    return CustomerDocumentResponse.model_validate(document)


@router.get("/{customer_id}/documents/{document_id}/file")
async def get_document_file(
    customer_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.VIEW_CUSTOMERS)),
):
    """Serve a customer document file."""
    # Verify customer exists
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )

    # Get document
    document = db.query(CustomerDocument).filter(
        CustomerDocument.id == document_id,
        CustomerDocument.customer_id == customer_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Check if file exists
    if not os.path.exists(document.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )

    # Force download — prevent browser from rendering uploaded files inline (XSS risk)
    return FileResponse(
        path=document.file_path,
        filename=document.file_name,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{document.file_name}"'},
    )


@router.delete("/{customer_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_document(
    customer_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_CUSTOMERS)),
):
    """Delete a customer document."""
    document = db.query(CustomerDocument).filter(
        CustomerDocument.id == document_id,
        CustomerDocument.customer_id == customer_id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Delete file from disk
    try:
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
    except Exception as e:
        print(f"Warning: Could not delete file {document.file_path}: {e}")
    
    # Delete database record
    db.delete(document)
    db.commit()
    
    return None
