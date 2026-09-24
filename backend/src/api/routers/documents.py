"""Documents API router for printing/generation."""

from typing import Annotated, Optional

from src.core.errors import AppException
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, require_permission
from src.core.db import get_db
from src.core.rbac import Permission
from src.services import printing_service

router = APIRouter()


class DocumentResponse(BaseModel):
    filename: str
    # The absolute server path was returned to clients, exposing the
    # deployment's directory layout. Callers need the download URL, not a
    # path they cannot use.
    download_url: str
    agreement_id: Optional[int] = None
    inspection_id: Optional[int] = None
    payment_id: Optional[int] = None
    generated_at: str


class DocumentListResponse(BaseModel):
    items: list[dict]


@router.post("/agreements/{agreement_id}/generate", response_model=DocumentResponse)
async def generate_agreement_document(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.PRINT_DOCUMENTS))],
    db: Annotated[Session, Depends(get_db)],
    template: str = Query("rental_agreement"),
):
    """Generate a rental agreement document."""
    try:
        result = printing_service.generate_agreement_document(
            db=db,
            agreement_id=agreement_id,
            template_name=template,
        )
        result.pop("filepath", None)
        return DocumentResponse(
            **result,
            download_url=f"/api/documents/download/{result['filename']}",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (AppException, HTTPException):
        # Already carries its own status and message — re-raising unchanged
        # stops a deliberate 400 being rewrapped as a 500 by the catch-all.
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document generation failed: {str(e)}")


@router.post("/agreements/{agreement_id}/receipt", response_model=DocumentResponse)
async def generate_receipt(
    agreement_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.PRINT_DOCUMENTS))],
    db: Annotated[Session, Depends(get_db)],
    payment_id: Optional[int] = None,
):
    """Generate a payment receipt document."""
    try:
        result = printing_service.generate_receipt(
            db=db,
            agreement_id=agreement_id,
            payment_id=payment_id,
        )
        result.pop("filepath", None)
        return DocumentResponse(
            **result,
            download_url=f"/api/documents/download/{result['filename']}",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (AppException, HTTPException):
        # Already carries its own status and message — re-raising unchanged
        # stops a deliberate 400 being rewrapped as a 500 by the catch-all.
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Receipt generation failed: {str(e)}")


@router.post("/inspections/{inspection_id}/report", response_model=DocumentResponse)
async def generate_inspection_report(
    inspection_id: int,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.PRINT_DOCUMENTS))],
    db: Annotated[Session, Depends(get_db)],
):
    """Generate an inspection report document."""
    try:
        result = printing_service.generate_inspection_report(
            db=db,
            inspection_id=inspection_id,
        )
        result.pop("filepath", None)
        return DocumentResponse(
            **result,
            download_url=f"/api/documents/download/{result['filename']}",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (AppException, HTTPException):
        # Already carries its own status and message — re-raising unchanged
        # stops a deliberate 400 being rewrapped as a 500 by the catch-all.
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.PRINT_DOCUMENTS))],
    agreement_id: Optional[int] = None,
):
    """List generated documents."""
    documents = printing_service.list_generated_documents(agreement_id)
    return DocumentListResponse(items=documents)


@router.get("/download/{filename}")
async def download_document(
    filename: str,
    current_user: Annotated[CurrentUser, Depends(require_permission(Permission.PRINT_DOCUMENTS))],
):
    """Download a generated document."""
    import os
    from pathlib import Path
    
    output_dir = Path(__file__).parent.parent.parent.parent / "generated_docs"
    filepath = output_dir / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Security check - ensure file is in output directory
    if not str(filepath.resolve()).startswith(str(output_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/octet-stream",
    )
