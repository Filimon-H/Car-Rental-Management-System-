"""Authentication dependencies for FastAPI."""

from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.core.db import get_db
from src.core.errors import ForbiddenError, UnauthorizedError
from src.core.rbac import Permission, Role, has_permission
from src.core.security import decode_token, verify_token_type
from src.models.staff_user import StaffUser

security = HTTPBearer()


def get_client_ip(request: Request) -> str | None:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def get_user_agent(user_agent: str | None = Header(None)) -> str | None:
    """Extract user agent from headers."""
    return user_agent


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)],
) -> StaffUser:
    """Get the current authenticated user from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise UnauthorizedError("Invalid or expired token")

    if not verify_token_type(payload, "access"):
        raise UnauthorizedError("Invalid token type")

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Invalid token payload")

    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if user is None:
        raise UnauthorizedError("User not found")

    if not user.is_active:
        raise UnauthorizedError("User is deactivated")

    # Reject tokens issued before the last logout or deactivation
    token_version = payload.get("tv")
    if token_version is None or int(token_version) != user.token_version:
        raise UnauthorizedError("Token has been revoked")

    return user


CurrentUser = Annotated[StaffUser, Depends(get_current_user)]


def require_permission(permission: Permission):
    """Dependency factory to require a specific permission."""

    def permission_checker(current_user: CurrentUser) -> StaffUser:
        if not has_permission(current_user.role, permission):
            raise ForbiddenError(f"Permission '{permission.value}' required")
        return current_user

    return permission_checker


def require_role(*roles: Role):
    """Dependency factory to require one of the specified roles."""

    def role_checker(current_user: CurrentUser) -> StaffUser:
        if current_user.role not in roles:
            raise ForbiddenError(f"One of roles {[r.value for r in roles]} required")
        return current_user

    return role_checker


def require_admin(current_user: CurrentUser) -> StaffUser:
    """Require admin role."""
    if current_user.role != Role.ADMIN:
        raise ForbiddenError("Admin role required")
    return current_user


AdminUser = Annotated[StaffUser, Depends(require_admin)]
