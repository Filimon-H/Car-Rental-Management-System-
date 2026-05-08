"""Tests for Telegram staff linking service."""

from datetime import timedelta, timezone, datetime

from src.core.errors import UnauthorizedError
from src.core.rbac import Role
from src.models.staff_user import StaffUser
from src.services import telegram_link_service


def _create_staff_user(db, username: str = "sales1") -> StaffUser:
    user = StaffUser(
        username=username,
        email=f"{username}@example.com",
        hashed_password="hashed",
        full_name="Sales User",
        role=Role.SALES,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_create_and_consume_link_code(db):
    user = _create_staff_user(db)

    link_code = telegram_link_service.create_link_code(db, user.id)

    link = telegram_link_service.consume_link_code(
        db,
        code=link_code.code,
        telegram_user_id=123456,
        chat_id=654321,
        telegram_username="novacar_staff",
    )

    assert link.staff_user_id == user.id
    assert link.chat_id == 654321
    assert link.telegram_user_id == 123456
    assert telegram_link_service.get_link_for_staff_user(db, user.id) is not None


def test_consume_link_code_rejects_expired_code(db):
    user = _create_staff_user(db, "sales2")
    link_code = telegram_link_service.create_link_code(db, user.id)
    link_code.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    try:
        telegram_link_service.consume_link_code(
            db,
            code=link_code.code,
            telegram_user_id=1,
            chat_id=1,
            telegram_username=None,
        )
        assert False, "Expected UnauthorizedError"
    except UnauthorizedError:
        pass
