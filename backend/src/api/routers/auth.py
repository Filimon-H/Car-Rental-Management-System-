"""Authentication router."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from src.api.deps.auth import get_client_ip, get_user_agent
from src.core.db import get_db
from src.core.errors import UnauthorizedError
from src.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
    verify_token_type,
)
from src.models.staff_user import StaffUser
from src.schemas.auth import LoginRequest, RefreshRequest, TokenResponse
from src.services import audit_service

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    """Authenticate user and return tokens."""
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    # Find user by username — always run bcrypt to prevent timing-based username enumeration
    user = db.query(StaffUser).filter(StaffUser.username == login_data.username).first()
    _DUMMY_HASH = "$2b$12$KIXn9YNPMNqAV.tIL3vMiubzQ4GBkN6J.6e5OPYC3v9iJkNJM3hNO"
    password_ok = verify_password(
        login_data.password,
        user.hashed_password if user else _DUMMY_HASH,
    )

    if user is None or not password_ok:
        # Log failed attempt
        audit_service.log_login_failed(
            db=db,
            username=login_data.username,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        raise UnauthorizedError("Invalid username or password")

    if not user.is_active:
        raise UnauthorizedError("User account is deactivated")

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    # Log successful login
    audit_service.log_login(
        db=db,
        user_id=user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    # Create tokens — embed token_version so logout can invalidate all issued tokens
    token_data = {"sub": str(user.id), "role": user.role.value, "tv": user.token_version}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=30 * 60,  # 30 minutes in seconds
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh_token(
    request: Request,
    refresh_data: RefreshRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    """Refresh access token using refresh token."""
    payload = decode_token(refresh_data.refresh_token)

    if payload is None:
        raise UnauthorizedError("Invalid or expired refresh token")

    if not verify_token_type(payload, "refresh"):
        raise UnauthorizedError("Invalid token type")

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Invalid token payload")

    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or deactivated")

    # Validate token version — reject if user has logged out since this token was issued
    token_version = payload.get("tv")
    if token_version is None or int(token_version) != user.token_version:
        raise UnauthorizedError("Token has been revoked")

    # Create new tokens
    token_data = {"sub": str(user.id), "role": user.role.value, "tv": user.token_version}
    access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=30 * 60,
    )
