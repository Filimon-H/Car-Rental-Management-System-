"""Staff user management API router (admin only)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db, require_permission
from src.core.rbac import Permission
from src.core.security import hash_password
from src.models.staff_user import StaffUser
from src.schemas.staff_user import (
    StaffUserCreate,
    StaffUserListResponse,
    StaffUserResetPassword,
    StaffUserResponse,
    StaffUserUpdate,
)

router = APIRouter()


@router.get("", response_model=StaffUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    query = db.query(StaffUser)

    if is_active is not None:
        query = query.filter(StaffUser.is_active == is_active)

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                StaffUser.username.ilike(term),
                StaffUser.full_name.ilike(term),
                StaffUser.email.ilike(term),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    users = query.order_by(StaffUser.full_name).offset(offset).limit(page_size).all()

    return StaffUserListResponse(
        items=[StaffUserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=StaffUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: StaffUserCreate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    if db.query(StaffUser).filter(StaffUser.username == data.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    if db.query(StaffUser).filter(StaffUser.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = StaffUser(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return StaffUserResponse.model_validate(user)


@router.get("/{user_id}", response_model=StaffUserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    user = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return StaffUserResponse.model_validate(user)


@router.put("/{user_id}", response_model=StaffUserResponse)
async def update_user(
    user_id: int,
    data: StaffUserUpdate,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    user = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent admin from deactivating themselves
    if user.id == current_user.id and data.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    if data.email is not None:
        existing = db.query(StaffUser).filter(
            StaffUser.email == data.email, StaffUser.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        user.email = data.email

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
        if not data.is_active:
            # Revoke all tokens on deactivation
            user.token_version += 1

    db.commit()
    db.refresh(user)
    return StaffUserResponse.model_validate(user)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: int,
    data: StaffUserResetPassword,
    db: Session = Depends(get_db),
    current_user: StaffUser = Depends(require_permission(Permission.MANAGE_USERS)),
):
    user = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1  # Invalidate all existing sessions
    db.commit()
    return None
