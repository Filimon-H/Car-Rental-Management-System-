"""The command menu must recover from a failed registration.

setMyCommands ran once at startup and only logged a warning on failure, so
if the network was down when the server started, polling recovered but the
menu stayed stale until the next restart. Per-chat menus were marked done
before the call succeeded, so a failed one was never retried either.
"""
import asyncio
from unittest.mock import AsyncMock

import pytest

from src.services.telegram_bot_service import TelegramBotService


@pytest.fixture
def service(monkeypatch):
    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    return svc


def calls_to(api: AsyncMock, method: str) -> int:
    return sum(1 for c in api.await_args_list if c.args and c.args[0] == method)


class TestDefaultMenu:
    def test_a_failed_registration_is_retried_once_polling_works(self, service):
        api = AsyncMock(side_effect=[RuntimeError("network down"), {"ok": True}])
        service._api = api

        asyncio.run(service._set_commands())
        assert service._commands_registered is False

        asyncio.run(service._retry_commands_if_needed())
        assert service._commands_registered is True
        assert calls_to(api, "setMyCommands") == 2

    def test_a_successful_registration_is_not_repeated(self, service):
        api = AsyncMock(return_value={"ok": True})
        service._api = api

        asyncio.run(service._set_commands())
        asyncio.run(service._retry_commands_if_needed())
        asyncio.run(service._retry_commands_if_needed())

        assert calls_to(api, "setMyCommands") == 1


class TestPerChatMenus:
    def test_a_failed_scoped_menu_is_tried_again(self, service):
        api = AsyncMock(side_effect=[RuntimeError("network down"), {"ok": True}])
        service._api = api

        asyncio.run(service._ensure_scoped_menu(42, "staff"))
        asyncio.run(service._ensure_scoped_menu(42, "staff"))

        assert calls_to(api, "setMyCommands") == 2
        assert service._scoped_menus.get(42) == "staff"

    def test_a_successful_scoped_menu_is_cached(self, service):
        api = AsyncMock(return_value={"ok": True})
        service._api = api

        asyncio.run(service._ensure_scoped_menu(42, "staff"))
        asyncio.run(service._ensure_scoped_menu(42, "staff"))

        assert calls_to(api, "setMyCommands") == 1


class TestThePollLoopRetries:
    def test_recovery_triggers_the_retry(self, service):
        """The retry must actually be wired into polling, not just exist."""
        service._commands_registered = False
        service._retry_commands_if_needed = AsyncMock()

        async def one_round():
            service._stop_event.clear()

            async def updates():
                service._stop_event.set()
                return []

            service._get_updates = updates
            await service._poll_loop()

        asyncio.run(one_round())
        service._retry_commands_if_needed.assert_awaited()
