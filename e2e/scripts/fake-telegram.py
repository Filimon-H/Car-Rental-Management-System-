"""Play the part of Telegram for the end-to-end suite.

Feeds the bot the updates Telegram would send when a customer taps the
website's "Confirm on Telegram" link and then shares their phone, and prints
what the bot replied. Runs only against the e2e database.

    fake-telegram.py <claim_token> <phone> [--forwarded]
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
if "e2e" not in os.environ.get("DATABASE_URL", ""):
    sys.exit("refusing: not the e2e database")

import src.models  # noqa: E402,F401
from src.services.telegram_bot_service import TelegramBotService  # noqa: E402

TELEGRAM_USER = 424242
token, phone = sys.argv[1], sys.argv[2]
sender = 999999 if "--forwarded" in sys.argv else TELEGRAM_USER

bot = TelegramBotService()
replies: list[str] = []


async def capture(chat_id, text, reply_markup=None):
    replies.append(text)


async def no_menu(chat_id, role):
    return True


bot._send_message = capture
bot.set_commands_for_chat = no_menu


def update(**message):
    message.update(chat={"id": TELEGRAM_USER}, **{"from": {"id": TELEGRAM_USER, "username": "e2e_customer"}})
    return {"message": message}


async def main():
    await bot._process_update(update(text=f"/start claim_{token}"))
    await bot._process_update(update(contact={"phone_number": phone, "user_id": sender}))


asyncio.run(main())
print("\n---\n".join(replies))
