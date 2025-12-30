"""Base error model and error codes."""

from enum import Enum
from typing import Any

from fastapi import HTTPException, status


class ErrorCode(str, Enum):
    """Application error codes."""

    # Authentication & Authorization
    AUTH_INVALID_CREDENTIALS = "AUTH_001"
    AUTH_TOKEN_EXPIRED = "AUTH_002"
    AUTH_TOKEN_INVALID = "AUTH_003"
    AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_004"

    # Resource errors
    RESOURCE_NOT_FOUND = "RES_001"
    RESOURCE_ALREADY_EXISTS = "RES_002"
    RESOURCE_CONFLICT = "RES_003"

    # Validation errors
    VALIDATION_ERROR = "VAL_001"
    INVALID_INPUT = "VAL_002"

    # Business logic errors
    VEHICLE_NOT_AVAILABLE = "BIZ_001"
    AGREEMENT_ALREADY_CLOSED = "BIZ_002"
    AGREEMENT_CANNOT_EXTEND = "BIZ_003"
    LEDGER_INSUFFICIENT_BALANCE = "BIZ_004"
    INSPECTION_ALREADY_COMPLETED = "BIZ_005"

    # System errors
    INTERNAL_ERROR = "SYS_001"
    DATABASE_ERROR = "SYS_002"
    EXTERNAL_SERVICE_ERROR = "SYS_003"


class AppException(HTTPException):
    """Base application exception with error code support."""

    def __init__(
        self,
        status_code: int,
        error_code: ErrorCode,
        detail: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.error_code = error_code


class NotFoundError(AppException):
    """Resource not found error."""

    def __init__(self, resource: str, identifier: Any) -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ErrorCode.RESOURCE_NOT_FOUND,
            detail=f"{resource} with id '{identifier}' not found",
        )


class ConflictError(AppException):
    """Resource conflict error."""

    def __init__(self, detail: str) -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            detail=detail,
        )


class UnauthorizedError(AppException):
    """Unauthorized access error."""

    def __init__(self, detail: str = "Invalid credentials") -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ErrorCode.AUTH_INVALID_CREDENTIALS,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppException):
    """Forbidden access error."""

    def __init__(self, detail: str = "Insufficient permissions") -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
            detail=detail,
        )


class ValidationError(AppException):
    """Validation error."""

    def __init__(self, detail: str) -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail=detail,
        )


class BusinessError(AppException):
    """Business logic error."""

    def __init__(self, error_code: ErrorCode, detail: str) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=error_code,
            detail=detail,
        )
