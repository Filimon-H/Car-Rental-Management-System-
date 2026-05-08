"""Collateral document schemas."""

from datetime import datetime

from pydantic import BaseModel

from src.models.customer_document import DocumentType


class CollateralDocumentResponse(BaseModel):
    """Response schema for collateral document."""

    id: int
    collateral_id: int
    doc_type: DocumentType
    file_name: str
    file_path: str
    file_size: int
    mime_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class CollateralDocumentListResponse(BaseModel):
    """Response schema for list of collateral documents."""

    items: list[CollateralDocumentResponse]
    total: int
