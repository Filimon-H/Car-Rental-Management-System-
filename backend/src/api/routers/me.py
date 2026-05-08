"""Current user (/me) router."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.deps.auth import CurrentUser, get_client_ip
from src.core.config import settings
from src.core.db import get_db
from src.core.errors import UnauthorizedError
from src.core.rbac import ROLE_PERMISSIONS
from src.core.security import hash_password, verify_password
from src.schemas.auth import MeResponse, PasswordChangeRequest
from src.schemas.telegram import TelegramLinkCodeResponse, TelegramLinkStatusResponse
from src.services import audit_service, telegram_link_service

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
    current_user.token_version += 1  # Revoke all existing tokens after password change
    db.commit()

    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Log out current user — increments token_version to revoke all existing tokens."""
    current_user.token_version += 1
    db.commit()
    audit_service.log_logout(db=db, user_id=current_user.id)
    return {"message": "Logged out successfully"}


@router.get("/telegram", response_model=TelegramLinkStatusResponse)
async def get_telegram_status(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> TelegramLinkStatusResponse:
    """Get Telegram linking status for the current staff user."""
    link = telegram_link_service.get_link_for_staff_user(db, current_user.id)
    return TelegramLinkStatusResponse(
        linked=link is not None,
        bot_username=settings.telegram_bot_username,
        telegram_username=link.telegram_username if link else None,
        linked_at=link.linked_at if link else None,
    )


@router.post("/telegram/link-code", response_model=TelegramLinkCodeResponse)
async def create_telegram_link_code(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> TelegramLinkCodeResponse:
    """Generate a one-time Telegram link code for the current staff user."""
    link_code = telegram_link_service.create_link_code(db, current_user.id)
    return TelegramLinkCodeResponse(
        code=link_code.code,
        expires_at=link_code.expires_at,
        bot_username=settings.telegram_bot_username,
    )


@router.delete("/telegram")
async def unlink_telegram(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Remove the Telegram link for the current staff user."""
    telegram_link_service.unlink_staff_user(db, current_user.id)
    return {"message": "Telegram link removed"}
