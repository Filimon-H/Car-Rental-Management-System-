"""Current user (/me) router."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, get_client_ip
from src.core.db import get_db
from src.core.errors import UnauthorizedError
from src.core.rbac import ROLE_PERMISSIONS
from src.core.security import hash_password, verify_password
from src.schemas.auth import MeResponse, PasswordChangeRequest
from src.services import audit_service

router = APIRouter()


@router.get("", response_model=MeResponse)
async def get_me(current_user: CurrentUser) -> MeResponse:
    """Get current user profile and permissions."""
    permissions = [p.value for p in ROLE_PERMISSIONS.get(current_user.role, set())]

    return MeResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        permissions=permissions,
    )


@router.post("/change-password")
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Change current user's password."""
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise UnauthorizedError("Current password is incorrect")

    current_user.hashed_password = hash_password(password_data.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Log out current user (audit only, client should discard tokens)."""
    audit_service.log_logout(db=db, user_id=current_user.id)
    return {"message": "Logged out successfully"}
