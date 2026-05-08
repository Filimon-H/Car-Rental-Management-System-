"""Service for linking Telegram chats to staff users."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets
import string

from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.errors import UnauthorizedError
from src.models.telegram import TelegramLinkCode, TelegramStaffLink


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _generate_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def create_link_code(db: Session, staff_user_id: int) -> TelegramLinkCode:
    """Create a one-time code for linking a Telegram chat."""
    db.query(TelegramLinkCode).filter(
        TelegramLinkCode.staff_user_id == staff_user_id,
        TelegramLinkCode.used_at.is_(None),
    ).delete(synchronize_session=False)

    code = _generate_code()
    while db.query(TelegramLinkCode).filter(TelegramLinkCode.code == code).first():
        code = _generate_code()

    link_code = TelegramLinkCode(
        staff_user_id=staff_user_id,
        code=code,
        expires_at=_utc_now() + timedelta(minutes=settings.telegram_link_code_expiry_minutes),
    )
    db.add(link_code)
    db.commit()
    db.refresh(link_code)
    return link_code


def consume_link_code(
    db: Session,
    code: str,
    telegram_user_id: int,
    chat_id: int,
    telegram_username: str | None,
) -> TelegramStaffLink:
    """Consume a link code and bind the Telegram chat to the staff user."""
    now = _utc_now()
    link_code = (
        db.query(TelegramLinkCode)
        .filter(TelegramLinkCode.code == code.strip().upper())
        .first()
    )
    if not link_code or link_code.used_at is not None or _as_utc(link_code.expires_at) < now:
        raise UnauthorizedError("Invalid or expired Telegram link code")

    existing = (
        db.query(TelegramStaffLink)
        .filter(
            (TelegramStaffLink.staff_user_id == link_code.staff_user_id)
            | (TelegramStaffLink.telegram_user_id == telegram_user_id)
            | (TelegramStaffLink.chat_id == chat_id)
        )
        .all()
    )
    for row in existing:
        db.delete(row)
    db.flush()

    link = TelegramStaffLink(
        staff_user_id=link_code.staff_user_id,
        telegram_user_id=telegram_user_id,
        chat_id=chat_id,
        telegram_username=telegram_username,
        linked_at=now,
        last_seen_at=now,
        is_active=True,
    )
    link_code.used_at = now
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def get_link_for_staff_user(db: Session, staff_user_id: int) -> TelegramStaffLink | None:
    """Return the Telegram link for a staff user."""
    return (
        db.query(TelegramStaffLink)
        .filter(
            TelegramStaffLink.staff_user_id == staff_user_id,
            TelegramStaffLink.is_active.is_(True),
        )
        .first()
    )


def get_link_for_chat(db: Session, chat_id: int) -> TelegramStaffLink | None:
    """Return the Telegram link for a Telegram chat."""
    return (
        db.query(TelegramStaffLink)
        .filter(TelegramStaffLink.chat_id == chat_id, TelegramStaffLink.is_active.is_(True))
        .first()
    )


def touch_link(db: Session, link: TelegramStaffLink, telegram_username: str | None) -> TelegramStaffLink:
    """Update last seen information for a Telegram link."""
    link.last_seen_at = _utc_now()
    link.telegram_username = telegram_username
    db.commit()
    db.refresh(link)
    return link


def unlink_staff_user(db: Session, staff_user_id: int) -> None:
    """Remove a Telegram link for a staff user."""
    link = get_link_for_staff_user(db, staff_user_id)
    if link:
        db.delete(link)
        db.commit()
