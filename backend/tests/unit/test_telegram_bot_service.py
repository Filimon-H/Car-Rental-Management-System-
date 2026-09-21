"""Coverage for the riskiest parts of the Telegram bot service.

The service is the largest file in the codebase and had no dedicated tests. These
target the two behaviours with real consequences: who receives broadcast business
data, and that a failing Telegram API backs off instead of hammering it.
"""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Permission, Role
from src.core.security import hash_password
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramStaffLink
from src.services.telegram_bot_service import TelegramBotService


def _staff(db: Session, username: str, role: Role, active: bool = True) -> StaffUser:
    u = StaffUser(username=username, email=f"{username}@e.com", full_name=username,
                  hashed_password=hash_password("testpass123"), role=role, is_active=active)
    db.add(u); db.commit(); db.refresh(u)
    return u


def _link(db: Session, user: StaffUser, chat_id: int, active: bool = True) -> TelegramStaffLink:
    link = TelegramStaffLink(staff_user_id=user.id, telegram_user_id=chat_id,
                             chat_id=chat_id, is_active=active)
    db.add(link); db.commit()
    return link


@pytest.fixture
def service(monkeypatch):
    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    return svc


class TestPermissionScopedBroadcast:
    """Business data must only reach staff whose role grants the permission."""

    def test_only_permitted_roles_receive(self, db: Session, service, monkeypatch):
        from src.services import telegram_bot_service as mod
        monkeypatch.setattr(mod, "SessionLocal", lambda: db)

        accountant = _staff(db, "tg_acct", Role.ACCOUNTANT)   # has VIEW_LEDGER
        inspector = _staff(db, "tg_insp", Role.INSPECTOR)     # does not
        _link(db, accountant, 1001)
        _link(db, inspector, 1002)

        sent: list[int] = []
        service._send_message = AsyncMock(side_effect=lambda chat_id, text: sent.append(chat_id))

        asyncio.run(service.send_message_to_permission(Permission.VIEW_LEDGER, "balances"))

        assert sent == [1001], "inspector must not receive ledger data"

    def test_deactivated_user_excluded(self, db: Session, service, monkeypatch):
        from src.services import telegram_bot_service as mod
        monkeypatch.setattr(mod, "SessionLocal", lambda: db)

        user = _staff(db, "tg_gone", Role.ADMIN, active=False)
        _link(db, user, 2001)

        sent: list[int] = []
        service._send_message = AsyncMock(side_effect=lambda chat_id, text: sent.append(chat_id))

        asyncio.run(service.send_message_to_permission(Permission.VIEW_LEDGER, "x"))
        assert sent == []

    def test_inactive_link_excluded(self, db: Session, service, monkeypatch):
        from src.services import telegram_bot_service as mod
        monkeypatch.setattr(mod, "SessionLocal", lambda: db)

        user = _staff(db, "tg_unlinked", Role.ADMIN)
        _link(db, user, 3001, active=False)

        sent: list[int] = []
        service._send_message = AsyncMock(side_effect=lambda chat_id, text: sent.append(chat_id))

        asyncio.run(service.send_message_to_permission(Permission.VIEW_LEDGER, "x"))
        assert sent == []

    def test_disabled_service_sends_nothing(self, db: Session, monkeypatch):
        svc = TelegramBotService()  # enabled is False without a token
        svc._send_message = AsyncMock()
        asyncio.run(svc.send_message_to_permission(Permission.VIEW_LEDGER, "x"))
        svc._send_message.assert_not_called()


class TestPollingBackoff:
    """A persistent API failure must back off, not retry at a fixed interval.

    The fixed 3s retry previously produced ~6.7k errors and 31MB of logs in one
    session against an unreachable Telegram API.
    """

    def test_delay_grows_and_is_capped(self, service):
        delays: list[float] = []

        async def failing_updates():
            raise RuntimeError("SSL: CERTIFICATE_VERIFY_FAILED")

        async def fake_sleep(seconds):
            delays.append(seconds)
            if len(delays) >= 8:
                service._stop_event.set()

        service._get_updates = AsyncMock(side_effect=failing_updates)
        with patch("asyncio.sleep", side_effect=fake_sleep):
            asyncio.run(service._poll_loop())

        assert delays[0] == service._BACKOFF_BASE_SECONDS
        assert delays == sorted(delays), f"delays must be non-decreasing: {delays}"
        assert delays[1] > delays[0], "delay must grow after repeated failures"
        assert max(delays) <= service._BACKOFF_MAX_SECONDS

    def test_counter_resets_after_recovery(self, service):
        """A success must clear the backoff so the next blip starts from the base."""
        calls = {"n": 0}
        delays: list[float] = []

        async def flaky():
            calls["n"] += 1
            if calls["n"] in (1, 2):
                raise RuntimeError("transient")
            if calls["n"] == 3:
                return []          # recovery
            raise RuntimeError("fails again")

        async def fake_sleep(seconds):
            delays.append(seconds)
            if len(delays) >= 3:
                service._stop_event.set()

        service._get_updates = AsyncMock(side_effect=flaky)
        with patch("asyncio.sleep", side_effect=fake_sleep):
            asyncio.run(service._poll_loop())

        # Two failures, then recovery, then a failure that restarts at the base.
        assert delays[0] == service._BACKOFF_BASE_SECONDS
        assert delays[2] == service._BACKOFF_BASE_SECONDS, f"backoff did not reset: {delays}"

    def test_stop_event_exits_loop(self, service):
        service._stop_event.set()
        service._get_updates = AsyncMock(return_value=[])
        asyncio.run(service._poll_loop())
        service._get_updates.assert_not_called()
