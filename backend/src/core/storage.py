"""File storage abstraction for uploads and generated documents."""

import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)


class StorageService:
    """File storage service for uploads and generated documents."""

    def __init__(self) -> None:
        self.upload_base = Path(settings.file_storage_path)
        self.generated_base = Path(settings.generated_docs_path)
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Ensure storage directories exist."""
        self.upload_base.mkdir(parents=True, exist_ok=True)
        self.generated_base.mkdir(parents=True, exist_ok=True)
        (self.upload_base / "vehicles").mkdir(exist_ok=True)
        (self.generated_base / "agreements").mkdir(exist_ok=True)

    def _generate_filename(self, original_filename: str, prefix: str = "") -> str:
        """Generate a unique filename preserving extension."""
        ext = Path(original_filename).suffix.lower()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        return f"{prefix}_{timestamp}_{unique_id}{ext}" if prefix else f"{timestamp}_{unique_id}{ext}"

    def save_vehicle_photo(
        self,
        file: BinaryIO,
        original_filename: str,
        vehicle_id: int,
        photo_kind: str,
    ) -> str:
        """Save a vehicle photo. Returns the relative path."""
        filename = self._generate_filename(original_filename, f"v{vehicle_id}_{photo_kind}")
        relative_path = f"vehicles/{filename}"
        full_path = self.upload_base / relative_path

        with open(full_path, "wb") as f:
            shutil.copyfileobj(file, f)

        logger.info(f"Saved vehicle photo: {relative_path}")
        return relative_path

    def save_generated_document(
        self,
        file: BinaryIO,
        doc_type: str,
        entity_id: int,
        extension: str = ".pdf",
    ) -> str:
        """Save a generated document. Returns the relative path."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        filename = f"{doc_type}_{entity_id}_{timestamp}_{unique_id}{extension}"
        relative_path = f"agreements/{filename}"
        full_path = self.generated_base / relative_path

        with open(full_path, "wb") as f:
            shutil.copyfileobj(file, f)

        logger.info(f"Saved generated document: {relative_path}")
        return relative_path

    def get_upload_path(self, relative_path: str) -> Path:
        """Get full path for an uploaded file."""
        return self.upload_base / relative_path

    def get_generated_path(self, relative_path: str) -> Path:
        """Get full path for a generated document."""
        return self.generated_base / relative_path

    def delete_file(self, base: Path, relative_path: str) -> bool:
        """Delete a file. Returns True if successful."""
        full_path = base / relative_path
        try:
            if full_path.exists():
                full_path.unlink()
                logger.info(f"Deleted file: {relative_path}")
                return True
            return False
        except OSError as e:
            logger.error(f"Failed to delete file {relative_path}: {e}")
            return False

    def file_exists(self, base: Path, relative_path: str) -> bool:
        """Check if a file exists."""
        return (base / relative_path).exists()


# Singleton instance
storage_service = StorageService()
