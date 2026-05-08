"""Schemas for Telegram staff linking."""

from datetime import datetime

from pydantic import BaseModel


class TelegramLinkStatusResponse(BaseModel):
    """Current staff user's Telegram link status."""

    linked: bool
    bot_username: str | None = None
    telegram_username: str | None = None
    linked_at: datetime | None = None


class TelegramLinkCodeResponse(BaseModel):
    """One-time Telegram link code."""

    code: str
    expires_at: datetime
    bot_username: str | None = None
