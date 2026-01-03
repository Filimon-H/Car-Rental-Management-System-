"""Customer document schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from src.models.customer_document import DocumentType


class CustomerDocumentResponse(BaseModel):
    """Response schema for customer document."""
    
    id: int
    customer_id: int
    doc_type: DocumentType
    file_name: str
    file_path: str
    file_size: int
    mime_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerDocumentUpload(BaseModel):
    """Schema for document upload metadata."""
    
    doc_type: DocumentType


class CustomerDocumentListResponse(BaseModel):
    """Response schema for list of customer documents."""
    
    items: list[CustomerDocumentResponse]
    total: int
