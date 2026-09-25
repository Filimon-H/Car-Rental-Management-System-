"""Telegram bot polling and notification delivery."""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from src.core.config import settings
from src.core.db import SessionLocal
from src.core.logging import get_logger
from src.core.rbac import Permission, has_permission
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramCustomerLink, TelegramCustomerLinkCode, TelegramStaffLink
from src.models.vehicle import Vehicle, VehicleStatus
from src.schemas.fields import normalize_ethiopian_phone
from src.services import agreement_service, billing_service, telegram_link_service

logger = get_logger(__name__)

#: Telegram rejects a sendMessage payload longer than this, and the failure
#: surfaces as silence: staff get no reply and no error. Stay well under it.
TELEGRAM_MESSAGE_LIMIT = 4096

#: Rows in any list command before truncating.
MAX_LIST_ROWS = 10


#: Customer-side command names, so a staff chat can name the mismatch
#: rather than reporting it as a typo.
_CUSTOMER_COMMAND_NAMES = {"/book", "/mybookings", "/extend", "/cancelbook"}


def contact_request_keyboard(label: str = "📱 Share my phone number") -> dict:
    """A one-tap keyboard that returns the account's own phone number.

    Telegram sends back a number it holds rather than a string someone
    typed, so this both removes the worst typing step in the flow and makes
    a malformed value impossible on that path.
    """
    return {
        "keyboard": [[{"text": label, "request_contact": True}]],
        "resize_keyboard": True,
        "one_time_keyboard": True,
    }


#: Dismisses a custom keyboard once it has served its purpose.
REMOVE_KEYBOARD = {"remove_keyboard": True}


def _is_valid_phone(value: str) -> bool:
    """Whether a normalised value is a real Ethiopian mobile number.

    normalize_ethiopian_phone passes unrecognised input through unchanged so
    a field validator can report it, so its output still has to be checked.
    """
    return bool(re.fullmatch(r"\+2519\d{8}", value))


def _looks_like_link_code(text: str) -> bool:
    """A bare token shaped like the codes the web app issues."""
    candidate = text.strip()
    return (
        6 <= len(candidate) <= 12
        and candidate.isalnum()
        and candidate.upper() == candidate
        and any(c.isalpha() for c in candidate)
    )


def mask_id_number(id_number: str | None) -> str:
    """Show at most the last four digits of a government ID.

    The rule here was `len(...) > 4`, so a short ID printed in full while a
    long one beside it was masked -- same command, same field, two
    treatments. Telegram stores chat history on its own servers and syncs it
    to every signed-in device, outside the web app's access controls, which
    makes a complete ID number the worst thing to print here.
    """
    if not id_number:
        return "—"
    # Prefer the last four digits: an ID like "PAR-CUST-1" tailed blindly
    # gives "...ST-1", which identifies nothing and reads like a typo.
    digits = [c for c in id_number if c.isdigit()]
    if len(digits) >= 4:
        return "..." + "".join(digits[-4:])
    return f"...{id_number[-4:]}"


def _business_time(value: datetime) -> datetime:
    """A stored timestamp as Addis wall time.

    Two kinds of timestamp live in this system. Business dates — pickup,
    expected return — are stored as local wall-clock with no offset, so they
    are already Addis time and must be printed unchanged. Only a value that
    carries a timezone is a true instant that needs converting.

    Tagging the naive value as UTC and converting it added three hours, and
    the date rolled with it: a rental due 8 January at 23:59 was shown as
    due 9 January, sending staff after the wrong day.
    """
    if value.tzinfo is None:
        return value
    return value.astimezone(ZoneInfo(settings.scheduler_timezone))


def business_now() -> datetime:
    """Now, as a naive Addis wall-clock value.

    Business dates are stored as naive local time, so comparing them against
    datetime.now(timezone.utc) was three hours out — enough to move a
    "days left" count onto the wrong day near a boundary.
    """
    return datetime.now(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)


def as_business_naive(value: datetime) -> datetime:
    """A stored value as naive Addis wall-clock, for comparisons."""
    if value.tzinfo is None:
        return value
    return value.astimezone(ZoneInfo(settings.scheduler_timezone)).replace(tzinfo=None)


def format_business_datetime(value: datetime, fmt: str = "%Y-%m-%d %H:%M") -> str:
    """Render a timestamp in the timezone staff actually work in.

    Due times were printed in UTC to Addis-based staff, so a rental running
    to midnight read as "due 20:59" -- three hours early, on the exact
    moment a late fee starts.
    """
    return f"{_business_time(value).strftime(fmt)} EAT"


def truncate_rows(rows: list[str], header: str, limit: int = MAX_LIST_ROWS) -> str:
    """Join rows under a header, capping the list and saying so.

    Silently cutting at the query's LIMIT was its own trap: staff saw five
    results with no indication a sixth existed.
    """
    shown = rows[:limit]
    body = [header, *shown]
    hidden = len(rows) - len(shown)
    if hidden > 0:
        body.append(f"…and {hidden} more — open the web app to see them all.")
    text = "\n".join(body)
    while len(text) > TELEGRAM_MESSAGE_LIMIT and len(shown) > 1:
        shown = shown[:-1]
        hidden = len(rows) - len(shown)
        text = "\n".join(
            [header, *shown, f"…and {hidden} more — open the web app to see them all."]
        )
    return text

ID_TYPE_LABELS = {
    "1": ("national_id", "National ID"),
    "2": ("passport", "Passport"),
    "3": ("kebele_id", "Kebele ID"),
    "4": ("driving_license", "Driver's License (as ID)"),
}


@dataclass
class CustomerRegistrationState:
    """Ephemeral chat state for guided customer creation (staff)."""

    step: str
    data: dict[str, str | None] = field(default_factory=lambda: {"business_type": "individual"})


@dataclass
class BookingState:
    """Ephemeral chat state for guided customer booking flow."""

    step: str  # pick_car | id_type | id_number | license | pickup_date | return_date | confirm
    data: dict[str, Any] = field(default_factory=dict)
    # data keys: vehicle_id, vehicle_label, id_type, id_number, license_number,
    #            pickup_datetime, return_datetime


class TelegramBotService:
    """Polling-based Telegram bot worker for staff operations."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._notification_task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._offset: int | None = None
        self._client: httpx.AsyncClient | None = None
        self._registration_states: dict[int, CustomerRegistrationState] = {}
        self._booking_states: dict[int, BookingState] = {}
        self._extend_states: dict[int, dict] = {}
        #: Chats that sent a bare /customer or /car and owe us a search term.
        #: Telegram's command-suggestion popup swallows the Enter key, so
        #: "/customer 0923677823" often arrives as a bare "/customer" with
        #: the argument dropped and nothing said about it.
        self._pending_search_states: dict[int, str] = {}
        #: Chats whose command menu has been scoped this process.
        self._scoped_menus: dict[int, str] = {}
        #: Strong refs to in-flight notification tasks, so the event
        #: loop does not garbage-collect them mid-send.
        self._pending_notifications: set = set()

    @property
    def enabled(self) -> bool:
        return bool(
            settings.telegram_bot_enabled
            and settings.telegram_bot_token
            and settings.telegram_bot_mode == "polling"
        )

    async def start(self) -> None:
        """Start background polling if Telegram is enabled."""
        if not self.enabled or self._task:
            return

        self._stop_event.clear()
        self._client = httpx.AsyncClient(
            base_url=f"https://api.telegram.org/bot{settings.telegram_bot_token}/",
            timeout=httpx.Timeout(30.0),
        )
        await self._set_commands()
        self._task = asyncio.create_task(self._poll_loop())
        self._notification_task = asyncio.create_task(self._notification_loop())
        logger.info("Telegram bot polling started")

    async def stop(self) -> None:
        """Stop background polling."""
        if not self._task:
            return

        self._stop_event.set()
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

        if self._notification_task is not None:
            self._notification_task.cancel()
            try:
                await self._notification_task
            except asyncio.CancelledError:
                pass
            self._notification_task = None

        if self._client is not None:
            await self._client.aclose()
            self._client = None

        logger.info("Telegram bot polling stopped")

    async def send_message_to_permission(self, permission: Permission, text: str) -> None:
        """Send a message to all linked staff users with a given permission."""
        if not self.enabled:
            return

        db = SessionLocal()
        try:
            links = (
                db.query(TelegramStaffLink)
                .options(joinedload(TelegramStaffLink.staff_user))
                .filter(TelegramStaffLink.is_active.is_(True))
                .all()
            )
            for link in links:
                if link.staff_user and link.staff_user.is_active and has_permission(link.staff_user.role, permission):
                    await self._send_message(link.chat_id, text)
        finally:
            db.close()

    # Backoff bounds for a failing Telegram API (unreachable host, bad cert, bad token).
    _BACKOFF_BASE_SECONDS = 3
    _BACKOFF_MAX_SECONDS = 300

    async def _poll_loop(self) -> None:
        """Long-poll Telegram for updates."""
        consecutive_failures = 0
        last_error: str | None = None

        while not self._stop_event.is_set():
            try:
                updates = await self._get_updates()
                for update in updates:
                    self._offset = update["update_id"] + 1
                    await self._process_update(update)
                if consecutive_failures:
                    logger.info("Telegram polling recovered after %d failures", consecutive_failures)
                consecutive_failures = 0
                last_error = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                consecutive_failures += 1
                # Exponential backoff, capped. A fixed 3s retry against a persistent
                # failure produced ~6.7k errors (and 31MB of logs) in one session.
                delay = min(
                    self._BACKOFF_BASE_SECONDS * (2 ** (consecutive_failures - 1)),
                    self._BACKOFF_MAX_SECONDS,
                )
                # Log the first occurrence, then only on escalation, to keep a
                # persistent outage from flooding the log.
                message = str(exc)
                if message != last_error or consecutive_failures in (1, 5, 10) or consecutive_failures % 50 == 0:
                    logger.error(
                        "Telegram polling error (attempt %d, retrying in %ds): %s",
                        consecutive_failures, delay, exc,
                    )
                    last_error = message
                await asyncio.sleep(delay)

    #: Commands every chat can run, whatever its role.
    _UNIVERSAL_COMMANDS = [
        {"command": "start", "description": "Start the bot"},
        {"command": "help", "description": "Show available commands"},
        {"command": "link", "description": "Link your account"},
        {"command": "cancel", "description": "Cancel current action"},
    ]

    _STAFF_COMMANDS = [
        {"command": "customer", "description": "Search customers"},
        {"command": "car", "description": "Search vehicles"},
        {"command": "due_today", "description": "Agreements due today"},
        {"command": "overdue", "description": "Overdue agreements"},
        {"command": "register_customer", "description": "Create a customer"},
    ]

    _CUSTOMER_COMMANDS = [
        {"command": "book", "description": "Browse available cars and book one"},
        {"command": "mybookings", "description": "View your bookings"},
        {"command": "extend", "description": "Extend your active rental"},
        {"command": "cancelbook", "description": "Cancel a booking"},
    ]

    def _commands_for_role(self, role: str) -> list[dict[str, str]]:
        """The menu a chat in this role should see.

        One global list meant a staff member's menu offered /book and a
        customer's offered /overdue, and tapping either answered "Unknown
        command". It also advertised a half-built customer surface to
        anyone who opened the bot.
        """
        extra = self._STAFF_COMMANDS if role == "staff" else self._CUSTOMER_COMMANDS
        return [*self._UNIVERSAL_COMMANDS, *extra]

    async def _ensure_scoped_menu(self, chat_id: int, role: str) -> None:
        """Scope a chat's menu once per process, for chats linked earlier."""
        if self._scoped_menus.get(chat_id) == role:
            return
        self._scoped_menus[chat_id] = role
        await self.set_commands_for_chat(chat_id, role)

    async def set_commands_for_chat(self, chat_id: int, role: str) -> None:
        """Scope a chat's menu to its role. Called when a chat links."""
        if not self.enabled:
            return
        try:
            await self._api(
                "setMyCommands",
                {
                    "commands": self._commands_for_role(role),
                    "scope": {"type": "chat", "chat_id": chat_id},
                },
            )
        except Exception as exc:
            logger.warning("Unable to scope commands for chat %s: %s", chat_id, exc)

    async def _set_commands(self) -> None:
        """Register the default command menu for unlinked chats."""
        if not self.enabled:
            return

        # An unlinked chat can only link, so that is all it is offered.
        commands = list(self._UNIVERSAL_COMMANDS)
        try:
            await self._api("setMyCommands", {"commands": commands})
        except Exception as exc:
            logger.warning("Unable to set Telegram commands: %s", exc)

    async def _get_updates(self) -> list[dict[str, Any]]:
        """Fetch bot updates with long polling."""
        response = await self._api(
            "getUpdates",
            {
                "offset": self._offset,
                "timeout": settings.telegram_polling_timeout_seconds,
                "allowed_updates": ["message"],
            },
        )
        return response

    async def _process_update(self, update: dict[str, Any]) -> None:
        """Handle a single Telegram update."""
        message = update.get("message") or {}
        chat = message.get("chat") or {}
        from_user = message.get("from") or {}
        text = (message.get("text") or "").strip()
        chat_id = chat.get("id")
        telegram_user_id = from_user.get("id")
        telegram_username = from_user.get("username")

        if chat_id is None or telegram_user_id is None:
            return

        # A shared contact is the phone step answered by tapping rather than
        # typing. It arrives with no text at all, so the guard below used to
        # drop it — along with photos, voice notes and locations, which got
        # no reply of any kind.
        contact = message.get("contact")
        if contact:
            await self._handle_contact(chat_id, telegram_user_id, contact)
            return

        if not text:
            await self._send_message(
                chat_id,
                "I can only read text messages. Use /help to see what I can do.",
            )
            return

        if text.startswith("/"):
            await self._handle_command(chat_id, telegram_user_id, telegram_username, text)
            return

        if chat_id in self._registration_states:
            await self._handle_registration_message(chat_id, telegram_user_id, telegram_username, text)
            return

        if chat_id in self._booking_states:
            await self._handle_booking_message(chat_id, text)
            return

        if chat_id in self._extend_states:
            await self._handle_extend_message(chat_id, text)
            return

        pending = self._pending_search_states.pop(chat_id, None)
        if pending:
            await self._handle_command(
                chat_id, telegram_user_id, telegram_username, f"{pending} {text}"
            )
            return

        # A code-shaped string in a chat is almost always a link attempt with
        # the /link prefix forgotten; pointing at /help was a dead end.
        if _looks_like_link_code(text):
            await self._send_message(
                chat_id, f"If this is a link code, send: /link {escape(text)}"
            )
            return

        await self._send_message(chat_id, "Use /help to see available commands.")

    def _clear_conversation_state(self, chat_id: int) -> bool:
        """Drop any half-finished conversation for this chat.

        Returns whether there was one, so callers can say what happened.
        """
        had = any(
            chat_id in store
            for store in (
                self._registration_states,
                self._booking_states,
                self._extend_states,
                self._pending_search_states,
            )
        )
        self._registration_states.pop(chat_id, None)
        self._booking_states.pop(chat_id, None)
        self._extend_states.pop(chat_id, None)
        self._pending_search_states.pop(chat_id, None)
        return had

    async def _apply_registration_phone(self, chat_id: int, raw: str) -> None:
        """Validate a phone for the registration flow, however it arrived.

        Phone is the identity key: /customer searches it and the duplicate
        guard keys on it. "notaphone" was once accepted here, echoed on the
        confirmation card and written to the record, leaving a customer
        unreachable by search and invisible to the guard.
        """
        state = self._registration_states.get(chat_id)
        if not state:
            return

        candidate = normalize_ethiopian_phone(raw)
        if not isinstance(candidate, str) or not _is_valid_phone(candidate):
            await self._send_message(
                chat_id,
                "That doesn't look like a phone number — send it as "
                "09… or +2519…, tap the button, or /cancel to stop.",
                reply_markup=contact_request_keyboard(),
            )
            return

        db = SessionLocal()
        try:
            # Catch a duplicate now rather than after four more fields.
            existing = (
                db.query(Customer)
                .filter(Customer.phone_primary == candidate)
                .first()
            )
            if existing:
                self._registration_states.pop(chat_id, None)
                await self._send_message(
                    chat_id,
                    f"That phone number already belongs to "
                    f"{escape(existing.full_name)} (customer {existing.id}).\n"
                    f"Use /customer {escape(candidate)} to open the record, "
                    "or /register_customer to start again with a different "
                    "number.",
                    reply_markup=REMOVE_KEYBOARD,
                )
                return
        finally:
            db.close()

        state.data["phone_primary"] = candidate
        state.step = "id_number"
        # "/skip" was rendered by Telegram as a tappable command that does
        # not exist; write it without the slash.
        await self._send_message(
            chat_id, "Send ID number, or send SKIP.", reply_markup=REMOVE_KEYBOARD
        )

    async def _handle_contact(
        self, chat_id: int, telegram_user_id: int, contact: dict[str, Any]
    ) -> None:
        """Use a shared contact as the answer to a pending phone prompt."""
        raw = str(contact.get("phone_number") or "")
        # Telegram often omits the leading +.
        if raw and not raw.startswith("+"):
            raw = f"+{raw}"

        state = self._registration_states.get(chat_id)
        if state and state.step == "phone_primary":
            await self._apply_registration_phone(chat_id, raw)
            return

        await self._send_message(
            chat_id,
            "Thanks. I only need a phone number when I ask for one — "
            "use /help to see what I can do.",
        )

    async def _handle_command(
        self,
        chat_id: int,
        telegram_user_id: int,
        telegram_username: str | None,
        text: str,
    ) -> None:
        """Route a bot command."""
        parts = text.split(maxsplit=1)
        command = parts[0].split("@")[0].lower()
        arg = parts[1].strip() if len(parts) > 1 else ""

        if command == "/start":
            await self._handle_start(chat_id)
            return
        if command == "/help":
            await self._handle_help(chat_id)
            return
        if command == "/link":
            await self._handle_link(chat_id, telegram_user_id, telegram_username, arg)
            return
        if command == "/cancel":
            # "Current action cancelled." implied something was aborted even
            # when nothing was running.
            had_something = self._clear_conversation_state(chat_id)
            await self._send_message(
                chat_id,
                "Current action cancelled."
                if had_something
                else "Nothing in progress. Use /help to see what you can do.",
            )
            return

        # Any other command supersedes whatever prompt was pending. Without
        # this a bare /car left an "awaiting search term" state that lay in
        # wait through several commands and silently swallowed the next
        # plain message — a phone number came back "No matching vehicles".
        self._clear_conversation_state(chat_id)

        db = SessionLocal()
        try:
            # Check staff link first
            staff_link = telegram_link_service.get_link_for_chat(db, chat_id)
            if staff_link:
                # Menus are scoped when a chat links, which chats linked
                # before that existed never did: they fall back to the
                # unlinked default and lose their commands from the menu.
                # Backfill once, on first activity.
                await self._ensure_scoped_menu(chat_id, "staff")
                staff_link = telegram_link_service.touch_link(db, staff_link, telegram_username)
                staff_user = (
                    db.query(StaffUser)
                    .filter(StaffUser.id == staff_link.staff_user_id, StaffUser.is_active.is_(True))
                    .first()
                )
                if not staff_user:
                    await self._send_message(chat_id, "Your linked staff account is inactive. Contact an admin.")
                    return
                if command == "/customer":
                    await self._handle_customer_lookup(db, staff_user, chat_id, arg)
                elif command == "/car":
                    await self._handle_vehicle_lookup(db, staff_user, chat_id, arg)
                elif command == "/due_today":
                    await self._handle_due_today(db, staff_user, chat_id)
                elif command == "/overdue":
                    await self._handle_overdue(db, staff_user, chat_id)
                elif command == "/register_customer":
                    await self._start_customer_registration(staff_user, chat_id)
                elif command in _CUSTOMER_COMMAND_NAMES:
                    await self._send_message(
                        chat_id,
                        "That command is for customers booking a car. "
                        "Use /help to see your staff commands.",
                    )
                else:
                    await self._send_message(chat_id, "Unknown command. Use /help.")
                return

            # Check customer link
            customer_link = (
                db.query(TelegramCustomerLink)
                .filter(TelegramCustomerLink.chat_id == chat_id, TelegramCustomerLink.is_active.is_(True))
                .first()
            )
            if customer_link:
                await self._ensure_scoped_menu(chat_id, "customer")
                customer_link.last_seen_at = datetime.now(timezone.utc)
                db.commit()
                customer_user = db.query(CustomerUser).filter(
                    CustomerUser.id == customer_link.customer_user_id, CustomerUser.is_active.is_(True)
                ).first()
                if not customer_user:
                    await self._send_message(chat_id, "Your account is inactive.")
                    return
                if command == "/mybookings":
                    await self._handle_customer_bookings(db, customer_user, chat_id)
                elif command == "/book":
                    await self._start_customer_booking(db, customer_user, chat_id)
                elif command == "/cancelbook":
                    await self._handle_cancel_booking(db, customer_user, chat_id, arg)
                elif command == "/extend":
                    await self._start_extend_booking(db, customer_user, chat_id)
                else:
                    await self._send_message(
                        chat_id,
                        "Available commands:\n"
                        "/book — Browse cars and book one\n"
                        "/mybookings — View your bookings\n"
                        "/extend — Extend your active rental\n"
                        "/cancelbook ID — Cancel a booking by agreement number\n"
                        "/cancel — Cancel current action\n"
                        "/help",
                    )
                return

            await self._send_message(
                chat_id,
                "This bot supports both staff and customer accounts.\n"
                "Staff: Generate a link code in the web app and send /link CODE\n"
                "Customers: Go to My Bookings on the website to get a link code, then send /link CODE",
            )
        finally:
            db.close()

    async def _handle_start(self, chat_id: int) -> None:
        """Handle /start."""
        db = SessionLocal()
        try:
            staff_link = telegram_link_service.get_link_for_chat(db, chat_id)
            if staff_link:
                await self._send_message(chat_id, "Staff bot ready. Use /help for commands.")
                return
            customer_link = db.query(TelegramCustomerLink).filter(
                TelegramCustomerLink.chat_id == chat_id, TelegramCustomerLink.is_active.is_(True)
            ).first()
            if customer_link:
                await self._send_message(
                    chat_id,
                    "Welcome back!\n\n"
                    "/book — Browse and book a car\n"
                    "/mybookings — View your bookings\n"
                    "/cancelbook — Cancel a booking\n"
                    "/help",
                )
                return
            username_suffix = f" (@{settings.telegram_bot_username})" if settings.telegram_bot_username else ""
            # A keyboard rather than a pointer to another command: an
            # unlinked chat previously had nothing to act on but /help.
            await self._send_message(
                chat_id,
                f"Welcome to the car rental bot{username_suffix}!\n\n"
                "To get started, link your account:\n"
                "• Customers: go to My Bookings on the website → get a link code → send /link CODE\n"
                "• Staff: generate a link code in the web app → send /link CODE",
                reply_markup={
                    "keyboard": [[{"text": "/help"}, {"text": "/link"}]],
                    "resize_keyboard": True,
                },
            )
        finally:
            db.close()

    async def _handle_help(self, chat_id: int) -> None:
        """Handle /help."""
        db = SessionLocal()
        try:
            link = telegram_link_service.get_link_for_chat(db, chat_id)
            if not link:
                # A linked customer has no staff link, and this treated that
                # as "not linked at all": they were offered /start, /link and
                # /help while /book, /mybookings, /extend and /cancelbook --
                # the only commands they can actually run -- went unlisted.
                customer_link = (
                    db.query(TelegramCustomerLink)
                    .filter(
                        TelegramCustomerLink.chat_id == chat_id,
                        TelegramCustomerLink.is_active.is_(True),
                    )
                    .first()
                )
                if customer_link:
                    await self._ensure_scoped_menu(chat_id, "customer")
                    await self._send_message(
                        chat_id,
                        "Available commands:\n"
                        "/book — Browse cars and book one\n"
                        "/mybookings — View your bookings\n"
                        "/extend — Extend your active rental\n"
                        "/cancelbook ID — Cancel a booking by agreement number\n"
                        "/cancel — Cancel current action\n"
                        "/help",
                    )
                    return
                await self._send_message(
                    chat_id,
                    "Available commands:\n"
                    "/start\n"
                    "/link CODE\n"
                    "/help",
                )
                return
            staff_user = db.query(StaffUser).filter(StaffUser.id == link.staff_user_id).first()
            if not staff_user:
                await self._send_message(chat_id, "Your linked staff account is inactive.")
                return

            await self._ensure_scoped_menu(chat_id, "staff")
            commands = ["/start", "/help", "/link CODE", "/cancel"]
            if has_permission(staff_user.role, Permission.VIEW_CUSTOMERS):
                commands.append("/customer SEARCH")
            if has_permission(staff_user.role, Permission.VIEW_VEHICLES):
                commands.append("/car SEARCH")
            if has_permission(staff_user.role, Permission.VIEW_AGREEMENTS):
                commands.extend(["/due_today", "/overdue"])
            if has_permission(staff_user.role, Permission.MANAGE_CUSTOMERS):
                commands.append("/register_customer")
            await self._send_message(chat_id, "Available commands:\n" + "\n".join(commands))
        finally:
            db.close()

    async def _handle_link(
        self,
        chat_id: int,
        telegram_user_id: int,
        telegram_username: str | None,
        arg: str,
    ) -> None:
        """Handle /link CODE — tries staff codes first, then customer codes."""
        if not arg:
            await self._send_message(chat_id, "Usage: /link CODE")
            return

        db = SessionLocal()
        try:
            # Try staff link code first
            try:
                link = telegram_link_service.consume_link_code(
                    db,
                    code=arg,
                    telegram_user_id=telegram_user_id,
                    chat_id=chat_id,
                    telegram_username=telegram_username,
                )
                staff_user = db.query(StaffUser).filter(StaffUser.id == link.staff_user_id).first()
                # Give this chat the menu for the role it just took on.
                await self.set_commands_for_chat(chat_id, "staff")
                await self._send_message(
                    chat_id,
                    f"Linked successfully to staff account {escape(staff_user.username)}.\nUse /help to see commands.",
                )
                return
            except Exception:
                pass  # Not a staff code — try customer code

            # Try customer link code
            now = datetime.now(timezone.utc)
            code_upper = arg.strip().upper()
            customer_code = (
                db.query(TelegramCustomerLinkCode)
                .filter(TelegramCustomerLinkCode.code == code_upper)
                .first()
            )
            if not customer_code or customer_code.used_at is not None:
                await self._send_message(chat_id, "Invalid or already-used link code.")
                return
            expires = customer_code.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < now:
                await self._send_message(chat_id, "Link code has expired. Generate a new one.")
                return

            # Remove any existing customer link for this chat or this user
            db.query(TelegramCustomerLink).filter(
                (TelegramCustomerLink.customer_user_id == customer_code.customer_user_id)
                | (TelegramCustomerLink.telegram_user_id == telegram_user_id)
                | (TelegramCustomerLink.chat_id == chat_id)
            ).delete(synchronize_session=False)

            # And any staff link, so the chat holds exactly one role. Staff
            # links are checked first in dispatch, so leaving one in place
            # would make this customer link unreachable.
            db.query(TelegramStaffLink).filter(
                (TelegramStaffLink.telegram_user_id == telegram_user_id)
                | (TelegramStaffLink.chat_id == chat_id)
            ).delete(synchronize_session=False)
            db.flush()

            new_link = TelegramCustomerLink(
                customer_user_id=customer_code.customer_user_id,
                telegram_user_id=telegram_user_id,
                chat_id=chat_id,
                telegram_username=telegram_username,
                linked_at=now,
                last_seen_at=now,
                is_active=True,
            )
            customer_code.used_at = now
            db.add(new_link)
            db.commit()

            customer_user = db.query(CustomerUser).filter(CustomerUser.id == customer_code.customer_user_id).first()
            db.refresh(customer_user)
            name = customer_user.customer.full_name if customer_user else "Customer"
            await self.set_commands_for_chat(chat_id, "customer")
            await self._send_message(
                chat_id,
                f"Linked to customer account {escape(name)}.\n"
                "Use /book to rent a car, or /mybookings to see your bookings.",
            )
        except Exception as exc:
            logger.exception("Link error: %s", exc)
            await self._send_message(chat_id, f"Link failed: {escape(str(exc))}")
        finally:
            db.close()

    async def _handle_customer_lookup(
        self,
        db,
        staff_user: StaffUser,
        chat_id: int,
        search: str,
    ) -> None:
        """Search customers from Telegram."""
        if not has_permission(staff_user.role, Permission.VIEW_CUSTOMERS):
            await self._send_message(chat_id, "You do not have permission to view customers.")
            return
        if len(search) < 2:
            self._pending_search_states[chat_id] = "/customer"
            await self._send_message(
                chat_id,
                "Send the name or phone number to search for, or /cancel to stop.",
            )
            return

        # Staff type the local format they read off a caller ID; records
        # store +251.... Without this, /customer 0923677823 found nothing
        # for a customer whose number is +251923677823.
        normalized = normalize_ethiopian_phone(search)
        phone_term = f"%{normalized}%" if isinstance(normalized, str) else f"%{search}%"
        search_term = f"%{search}%"
        customers = (
            db.query(Customer)
            .filter(Customer.is_active.is_(True))
            .filter(
                or_(
                    Customer.first_name.ilike(search_term),
                    Customer.last_name.ilike(search_term),
                    Customer.phone_primary.ilike(phone_term),
                    Customer.id_number.ilike(search_term),
                )
            )
            .order_by(Customer.first_name, Customer.last_name)
            .limit(MAX_LIST_ROWS + 1)
            .all()
        )
        if not customers:
            await self._send_message(chat_id, "No matching customers found.")
            return

        lines = []
        for customer in customers:
            lines.append(
                f"{customer.id}: {escape(customer.full_name)} | {escape(customer.phone_primary)}"
                + (
                    f" | ID {escape(mask_id_number(customer.id_number))}"
                    if customer.id_number
                    else ""
                )
            )
        await self._send_message(chat_id, truncate_rows(lines, "Customer matches:"))

    async def _handle_vehicle_lookup(
        self,
        db,
        staff_user: StaffUser,
        chat_id: int,
        search: str,
    ) -> None:
        """Search vehicles from Telegram."""
        if not has_permission(staff_user.role, Permission.VIEW_VEHICLES):
            await self._send_message(chat_id, "You do not have permission to view vehicles.")
            return
        if len(search) < 1:
            self._pending_search_states[chat_id] = "/car"
            await self._send_message(
                chat_id,
                "Send the plate or model to search for, or /cancel to stop.",
            )
            return

        search_term = f"%{search}%"
        vehicles = (
            db.query(Vehicle)
            .filter(Vehicle.is_active.is_(True))
            .filter(
                or_(
                    Vehicle.plate_number.ilike(search_term),
                    Vehicle.make.ilike(search_term),
                    Vehicle.model.ilike(search_term),
                )
            )
            .order_by(Vehicle.plate_number)
            .limit(MAX_LIST_ROWS + 1)
            .all()
        )
        if not vehicles:
            await self._send_message(chat_id, "No matching vehicles found.")
            return

        lines = []
        for vehicle in vehicles:
            lines.append(
                f"{escape(vehicle.plate_number)} | {escape(vehicle.make)} {escape(vehicle.model)} {vehicle.year}"
                f" | {vehicle.status.value} | ETB {vehicle.daily_rate}"
            )
        await self._send_message(chat_id, truncate_rows(lines, "Vehicle matches:"))

    async def _handle_due_today(self, db, staff_user: StaffUser, chat_id: int) -> None:
        """List agreements due today."""
        if not has_permission(staff_user.role, Permission.VIEW_AGREEMENTS):
            await self._send_message(chat_id, "You do not have permission to view agreements.")
            return

        today = datetime.now(timezone.utc).date()
        agreements = (
            db.query(Agreement)
            .options(joinedload(Agreement.customer))
            .filter(Agreement.status == AgreementStatus.ACTIVE)
            .order_by(Agreement.expected_return_datetime.asc())
            .all()
        )
        due_today = [a for a in agreements if a.expected_return_datetime.astimezone(timezone.utc).date() == today]
        if not due_today:
            await self._send_message(chat_id, "No agreements are due today.")
            return

        lines = []
        for agreement in due_today:
            lines.append(
                f"{escape(agreement.agreement_number)} | {escape(agreement.customer.full_name)} | "
                f"{format_business_datetime(agreement.expected_return_datetime, '%H:%M')}"
            )
        await self._send_message(chat_id, truncate_rows(lines, "Agreements due today:"))

    async def _handle_overdue(self, db, staff_user: StaffUser, chat_id: int) -> None:
        """List overdue agreements with balance due."""
        if not has_permission(staff_user.role, Permission.VIEW_AGREEMENTS):
            await self._send_message(chat_id, "You do not have permission to view agreements.")
            return

        agreements = (
            db.query(Agreement)
            .options(joinedload(Agreement.customer))
            .filter(Agreement.status == AgreementStatus.OVERDUE)
            .order_by(Agreement.expected_return_datetime.asc())
            .limit(MAX_LIST_ROWS + 1)
            .all()
        )
        if not agreements:
            await self._send_message(chat_id, "No overdue agreements found.")
            return

        # Only the rows that will be shown need a balance; the extra row the
        # query fetched exists solely to prove more of them are out there.
        lines = []
        for agreement in agreements[:MAX_LIST_ROWS]:
            summary = agreement_service.get_agreement_summary(db, agreement.id)
            lines.append(
                f"{escape(agreement.agreement_number)} | {escape(agreement.customer.full_name)} | "
                f"due {format_business_datetime(agreement.expected_return_datetime)} | "
                f"balance ETB {summary['balance_due']}"
            )
        body = truncate_rows(lines, "Overdue agreements:")
        if len(agreements) > MAX_LIST_ROWS:
            body += "\n…and more — open the web app to see them all."
        await self._send_message(chat_id, body)

    async def _start_customer_registration(self, staff_user: StaffUser, chat_id: int) -> None:
        """Start guided customer creation."""
        if not has_permission(staff_user.role, Permission.MANAGE_CUSTOMERS):
            await self._send_message(chat_id, "You do not have permission to create customers.")
            return

        self._registration_states[chat_id] = CustomerRegistrationState(step="first_name")
        await self._send_message(
            chat_id,
            "Customer registration started.\nSend the customer's first name, or /cancel.",
        )

    async def _handle_registration_message(
        self,
        chat_id: int,
        telegram_user_id: int,
        telegram_username: str | None,
        text: str,
    ) -> None:
        """Advance guided customer creation."""
        state = self._registration_states.get(chat_id)
        if not state:
            return

        db = SessionLocal()
        try:
            link = telegram_link_service.get_link_for_chat(db, chat_id)
            if not link:
                self._registration_states.pop(chat_id, None)
                await self._send_message(chat_id, "Link your staff account first with /link CODE.")
                return
            telegram_link_service.touch_link(db, link, telegram_username)
            staff_user = db.query(StaffUser).filter(StaffUser.id == link.staff_user_id).first()
            if not staff_user or not has_permission(staff_user.role, Permission.MANAGE_CUSTOMERS):
                self._registration_states.pop(chat_id, None)
                await self._send_message(chat_id, "You do not have permission to create customers.")
                return

            if state.step == "first_name":
                state.data["first_name"] = text
                state.step = "last_name"
                await self._send_message(chat_id, "Send the customer's last name.")
            elif state.step == "last_name":
                state.data["last_name"] = text
                state.step = "phone_primary"
                await self._send_message(
                    chat_id,
                    "Send the phone number, or tap the button to share yours.",
                    reply_markup=contact_request_keyboard(),
                )
            elif state.step == "phone_primary":
                # Typed or tapped, one path: sharing a contact must not be a
                # way round the validation and duplicate checks.
                await self._apply_registration_phone(chat_id, text)
                return
            elif state.step == "id_number":
                state.data["id_number"] = None if text.upper() == "SKIP" else text
                state.step = "license_number"
                await self._send_message(chat_id, "Send driver license number, or SKIP.")
            elif state.step == "license_number":
                state.data["driver_license_number"] = None if text.upper() == "SKIP" else text
                state.step = "confirm"
                await self._send_message(
                    chat_id,
                    "Reply CONFIRM to create this customer:\n"
                    f"{escape(state.data['first_name'] or '')} {escape(state.data['last_name'] or '')}\n"
                    f"Phone: {escape(state.data['phone_primary'] or '')}"
                    # Skipped fields were shown as "n/a", which reads like
                    # missing data rather than a deliberate omission.
                    + (
                        f"\nID: {escape(mask_id_number(state.data['id_number']))}"
                        if state.data.get("id_number")
                        else "\nID: not recorded"
                    )
                    + (
                        f"\nLicense: {escape(state.data['driver_license_number'])}"
                        if state.data.get("driver_license_number")
                        else "\nLicence: not recorded"
                    ),
                    reply_markup=REMOVE_KEYBOARD,
                )
            elif state.step == "confirm":
                if text.upper() != "CONFIRM":
                    await self._send_message(chat_id, "Send CONFIRM to create the customer, or /cancel.")
                    return

                if state.data.get("id_number"):
                    duplicate = db.query(Customer).filter(Customer.id_number == state.data["id_number"]).first()
                    if duplicate:
                        self._registration_states.pop(chat_id, None)
                        await self._send_message(chat_id, "A customer with that ID number already exists.")
                        return

                # Store one canonical form, and refuse a number already on
                # file. Without this, "0923677823" and "+251923677823"
                # became separate people: three records ended up sharing one
                # number under three spellings of the same name, splitting
                # that customer's agreements across them.
                raw_phone = state.data["phone_primary"] or ""
                normalized_phone = normalize_ethiopian_phone(raw_phone)
                phone_primary = (
                    normalized_phone if isinstance(normalized_phone, str) else raw_phone
                )

                if phone_primary:
                    existing = (
                        db.query(Customer)
                        .filter(Customer.phone_primary == phone_primary)
                        .first()
                    )
                    if existing:
                        self._registration_states.pop(chat_id, None)
                        await self._send_message(
                            chat_id,
                            f"That phone number already belongs to "
                            f"{escape(existing.full_name)} (customer {existing.id}). "
                            f"Use /customer {escape(phone_primary)} to open the record, "
                            f"or correct the number and try again.",
                        )
                        return

                customer = Customer(
                    business_type="individual",
                    first_name=state.data["first_name"] or "",
                    last_name=state.data["last_name"] or "",
                    phone_primary=phone_primary,
                    id_number=state.data.get("id_number"),
                    license_number=state.data.get("driver_license_number"),
                )
                db.add(customer)
                db.commit()
                db.refresh(customer)
                self._registration_states.pop(chat_id, None)
                await self._send_message(
                    chat_id,
                    f"Customer created: {escape(customer.full_name)} (ID {customer.id}).",
                )
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Customer booking flow
    # ------------------------------------------------------------------

    async def _start_customer_booking(self, db, customer_user: CustomerUser, chat_id: int) -> None:
        """Step 0: show available cars and ask the customer to pick one."""
        vehicles = (
            db.query(Vehicle)
            .filter(Vehicle.is_active.is_(True), Vehicle.status == VehicleStatus.AVAILABLE)
            .order_by(Vehicle.daily_rate.asc())
            .all()
        )
        if not vehicles:
            await self._send_message(chat_id, "No cars are available for booking right now. Check back soon!")
            return

        # A whole fleet in one message crosses Telegram's 4096-character cap,
        # which fails as silence. Offer a page of them and say there are more.
        shown = vehicles[:MAX_LIST_ROWS]
        rows = [
            f"{i}. {escape(v.make)} {escape(v.model)} {v.year} | "
            f"{v.vehicle_type} | {v.seats} seats | "
            f"ETB {v.daily_rate}/day"
            for i, v in enumerate(shown, 1)
        ]
        if len(vehicles) > len(shown):
            rows.append(
                f"…and {len(vehicles) - len(shown)} more — "
                "browse the full fleet on the website."
            )
        rows.append("Or /cancel to stop.")

        self._booking_states[chat_id] = BookingState(
            step="pick_car",
            data={"vehicles": [{"id": v.id, "label": f"{v.make} {v.model} {v.year}", "rate": str(v.daily_rate), "weekly": str(v.weekly_rate or ""), "monthly": str(v.monthly_rate or "")} for v in shown]},
        )
        await self._send_message(
            chat_id,
            truncate_rows(rows, "Available cars — reply with the number to select:", limit=len(rows)),
        )

    async def _handle_booking_message(self, chat_id: int, text: str) -> None:
        """Advance the guided booking conversation."""
        state = self._booking_states.get(chat_id)
        if not state:
            return

        db = SessionLocal()
        try:
            # Resolve customer user
            customer_link = db.query(TelegramCustomerLink).filter(
                TelegramCustomerLink.chat_id == chat_id,
                TelegramCustomerLink.is_active.is_(True),
            ).first()
            if not customer_link:
                self._booking_states.pop(chat_id, None)
                return
            customer_user = db.query(CustomerUser).filter(
                CustomerUser.id == customer_link.customer_user_id,
                CustomerUser.is_active.is_(True),
            ).first()
            if not customer_user:
                self._booking_states.pop(chat_id, None)
                return

            db.refresh(customer_user)
            customer = customer_user.customer

            if state.step == "pick_car":
                vehicles = state.data.get("vehicles", [])
                if not text.isdigit() or not (1 <= int(text) <= len(vehicles)):
                    await self._send_message(chat_id, f"Please reply with a number between 1 and {len(vehicles)}, or /cancel.")
                    return
                chosen = vehicles[int(text) - 1]
                state.data["vehicle_id"] = chosen["id"]
                state.data["vehicle_label"] = chosen["label"]
                state.data["daily_rate"] = chosen["rate"]
                state.data["weekly"] = chosen.get("weekly") or ""
                state.data["monthly"] = chosen.get("monthly") or ""

                # Check if customer already has ID on file
                if customer.id_number and customer.license_number:
                    state.data["id_type"] = customer.id_type or "national_id"
                    state.data["id_number"] = customer.id_number
                    state.data["license_number"] = customer.license_number
                    state.step = "pickup_date"
                    await self._send_message(
                        chat_id,
                        f"Selected: {escape(chosen['label'])}\n\n"
                        f"ID and license on file (ID {escape(mask_id_number(customer.id_number))}).\n\n"
                        "Send pickup date (DD/MM/YYYY), or /cancel.",
                    )
                else:
                    state.step = "id_type"
                    await self._send_message(
                        chat_id,
                        f"Selected: {escape(chosen['label'])}\n\n"
                        "We need your ID details for the rental.\n"
                        "What is your ID type?\n"
                        "1. National ID\n2. Passport\n3. Kebele ID\n4. Driver's License (as ID)\n\n"
                        "Reply with the number, or /cancel.",
                    )

            elif state.step == "id_type":
                if text not in ID_TYPE_LABELS:
                    await self._send_message(chat_id, "Reply with 1, 2, 3, or 4.")
                    return
                state.data["id_type"] = ID_TYPE_LABELS[text][0]
                state.step = "id_number"
                await self._send_message(chat_id, f"Send your {ID_TYPE_LABELS[text][1]} number:")

            elif state.step == "id_number":
                if len(text) < 3:
                    await self._send_message(chat_id, "ID number too short. Please try again.")
                    return
                state.data["id_number"] = text
                state.step = "license"
                await self._send_message(chat_id, "Send your driver's license number:")

            elif state.step == "license":
                if len(text) < 3:
                    await self._send_message(chat_id, "License number too short. Please try again.")
                    return
                state.data["license_number"] = text
                state.step = "pickup_date"
                await self._send_message(chat_id, "Send pickup date (DD/MM/YYYY), or /cancel:")

            elif state.step == "pickup_date":
                try:
                    pickup = datetime.strptime(text.strip(), "%d/%m/%Y").replace(
                        hour=9, minute=0, tzinfo=timezone.utc
                    )
                except ValueError:
                    await self._send_message(chat_id, "Invalid date. Use DD/MM/YYYY format (e.g. 20/05/2026).")
                    return
                if pickup <= datetime.now(timezone.utc):
                    await self._send_message(chat_id, "Pickup date must be in the future. Try again:")
                    return
                state.data["pickup_datetime"] = pickup.isoformat()
                state.step = "return_date"
                await self._send_message(chat_id, "Send return date (DD/MM/YYYY):")

            elif state.step == "return_date":
                try:
                    ret = datetime.strptime(text.strip(), "%d/%m/%Y").replace(
                        hour=9, minute=0, tzinfo=timezone.utc
                    )
                except ValueError:
                    await self._send_message(chat_id, "Invalid date. Use DD/MM/YYYY format (e.g. 25/05/2026).")
                    return
                pickup = datetime.fromisoformat(state.data["pickup_datetime"])
                if ret <= pickup:
                    await self._send_message(chat_id, "Return date must be after pickup date. Try again:")
                    return
                state.data["return_datetime"] = ret.isoformat()
                days = (ret - pickup).days

                # Was rate x days, so the bot quoted 7,700 for a week the web
                # page quotes 6,500 and the agreement charges 6,500. Price it
                # with the same engine so the three cannot disagree.
                rate = Decimal(state.data["daily_rate"])
                weekly = state.data.get("weekly") or None
                monthly = state.data.get("monthly") or None
                days, total = billing_service.calculate_rental_charge(
                    pickup,
                    ret,
                    rate,
                    Decimal(weekly) if weekly else None,
                    Decimal(monthly) if monthly else None,
                )

                state.data["days"] = days
                state.data["total"] = str(total)
                state.data["tiered"] = total < rate * days

                state.step = "pickup_location"
                await self._send_message(
                    chat_id,
                    f"{days} day{'s' if days != 1 else ''} — ETB {total:,.2f}\n"
                    + (
                        "Best weekly/monthly tier applied.\n\n"
                        if total < rate * days
                        else "Daily rate applied.\n\n"
                    )
                    + "Where should we deliver the car? Send a pickup location, "
                    "or 'skip'.",
                )

            elif state.step == "pickup_location":
                # The web form asks for these; the bot never did, so staff got
                # a request with no location and had to phone the customer.
                state.data["pickup_location"] = "" if text.strip().lower() == "skip" else text.strip()
                state.step = "notes"
                await self._send_message(
                    chat_id,
                    "Any notes for our team (child seat, late pickup…)? "
                    "Send them, or 'skip'.",
                )

            elif state.step == "notes":
                state.data["notes"] = "" if text.strip().lower() == "skip" else text.strip()

                pickup = datetime.fromisoformat(state.data["pickup_datetime"])
                ret = datetime.fromisoformat(state.data["return_datetime"])
                days = state.data["days"]
                total = Decimal(state.data["total"])

                state.step = "confirm"
                await self._send_message(
                    chat_id,
                    f"Booking summary:\n\n"
                    f"Car: {escape(state.data['vehicle_label'])}\n"
                    f"Pickup: {pickup.strftime('%d %b %Y')} 09:00\n"
                    f"Return: {ret.strftime('%d %b %Y')} 09:00 ({days} day{'s' if days != 1 else ''})\n"
                    + (
                        f"Pickup location: {escape(state.data['pickup_location'])}\n"
                        if state.data.get("pickup_location")
                        else ""
                    )
                    + (
                        f"Notes: {escape(state.data['notes'])}\n"
                        if state.data.get("notes")
                        else ""
                    )
                    + f"Estimated total: ETB {total:,.2f}"
                    + (" (weekly/monthly tier)" if state.data.get("tiered") else "")
                    + "\n"
                    f"ID: {escape(mask_id_number(state.data['id_number']))} ({escape(state.data['id_type'].replace('_', ' '))})\n\n"
                    "The final price and any deposit are confirmed by our team "
                    "when they review your request.\n\n"
                    "Reply CONFIRM to submit, or /cancel.",
                )

            elif state.step == "confirm":
                if text.strip().upper() != "CONFIRM":
                    await self._send_message(chat_id, "Send CONFIRM to submit the booking, or /cancel.")
                    return

                # A licence that expires before the car comes back means the
                # customer cannot legally drive it. The web booking endpoint
                # refuses this; the bot booked anyway.
                ret_at = datetime.fromisoformat(state.data["return_datetime"])
                expiry = customer.license_expiry
                if expiry is not None:
                    if expiry.tzinfo is None:
                        expiry = expiry.replace(tzinfo=timezone.utc)
                    if expiry < ret_at:
                        self._booking_states.pop(chat_id, None)
                        await self._send_message(
                            chat_id,
                            f"Your driving licence expires on "
                            f"{expiry.date().isoformat()}, before this rental ends. "
                            "Please renew it or contact us before booking.",
                        )
                        return

                # Save ID and license to customer profile
                customer.id_type = state.data["id_type"]
                customer.id_number = state.data["id_number"]
                customer.license_number = state.data["license_number"]
                db.flush()

                # Create the booking_requested agreement
                vehicle = db.query(Vehicle).filter(Vehicle.id == state.data["vehicle_id"]).first()
                if not vehicle or vehicle.status != VehicleStatus.AVAILABLE:
                    self._booking_states.pop(chat_id, None)
                    await self._send_message(chat_id, "Sorry, that car is no longer available. Use /book to see current options.")
                    return

                pickup = datetime.fromisoformat(state.data["pickup_datetime"])
                ret = datetime.fromisoformat(state.data["return_datetime"])
                agr_number = agreement_service.generate_agreement_number(db)
                agr = Agreement(
                    agreement_number=agr_number,
                    agreement_type=AgreementType.CUSTOMER_VEHICLE,
                    status=AgreementStatus.BOOKING_REQUESTED,
                    customer_id=customer.id,
                    pickup_datetime=pickup,
                    expected_return_datetime=ret,
                    agreed_daily_rate=vehicle.daily_rate,
                    deposit_amount=Decimal("0"),
                    pickup_location=state.data.get("pickup_location") or None,
                    return_location=state.data.get("pickup_location") or None,
                    notes=state.data.get("notes") or None,
                )
                db.add(agr)
                db.flush()
                seg = AgreementVehicleSegment(
                    agreement_id=agr.id,
                    vehicle_id=vehicle.id,
                    start_datetime=pickup,
                    end_datetime=ret,
                    daily_rate=vehicle.daily_rate,
                )
                db.add(seg)
                db.commit()
                db.refresh(agr)

                self._booking_states.pop(chat_id, None)
                await self._send_message(
                    chat_id,
                    f"Booking submitted!\n\n"
                    f"Reference: {escape(agr.agreement_number)}\n"
                    f"Status: Pending Review\n\n"
                    "Our team will confirm your booking shortly. "
                    "Use /mybookings to track the status.",
                )
        except Exception as exc:
            logger.exception("Booking flow error: %s", exc)
            self._booking_states.pop(chat_id, None)
            await self._send_message(chat_id, f"Something went wrong: {escape(str(exc))}\nPlease try /book again.")
        finally:
            db.close()

    async def _handle_cancel_booking(
        self, db, customer_user: CustomerUser, chat_id: int, arg: str
    ) -> None:
        """Cancel a booking_requested or pending_payment agreement by agreement number."""
        db.refresh(customer_user)
        customer = customer_user.customer

        if not arg:
            # Show recent cancellable bookings
            agreements = (
                db.query(Agreement)
                .filter(
                    Agreement.customer_id == customer.id,
                    Agreement.status.in_([AgreementStatus.BOOKING_REQUESTED, AgreementStatus.PENDING_PAYMENT]),
                )
                .order_by(Agreement.created_at.desc())
                .limit(5)
                .all()
            )
            if not agreements:
                await self._send_message(chat_id, "You have no cancellable bookings.")
                return
            lines = ["Your cancellable bookings:\n"]
            for a in agreements:
                pickup = a.pickup_datetime.strftime("%d %b %Y") if a.pickup_datetime else "—"
                lines.append(f"• {escape(a.agreement_number)} — {a.status.value.replace('_', ' ')} | pickup {pickup}")
            lines.append("\nUse /cancelbook AGREEMENT_NUMBER to cancel one.")
            await self._send_message(chat_id, "\n".join(lines))
            return

        # Find by agreement number
        agreement = (
            db.query(Agreement)
            .filter(
                Agreement.customer_id == customer.id,
                Agreement.agreement_number == arg.strip().upper(),
            )
            .first()
        )
        if not agreement:
            await self._send_message(chat_id, f"Booking {escape(arg)} not found.")
            return

        try:
            agreement_service.cancel_agreement(db, agreement.id)
            await self._send_message(
                chat_id,
                f"Booking {escape(agreement.agreement_number)} has been cancelled.",
            )
        except Exception as exc:
            await self._send_message(chat_id, f"Cannot cancel: {escape(str(exc))}")

    async def _handle_customer_bookings(
        self,
        db,
        customer_user: CustomerUser,
        chat_id: int,
    ) -> None:
        """List the customer's recent bookings."""
        from sqlalchemy.orm import joinedload as _joinedload
        db.refresh(customer_user)
        agreements = (
            db.query(Agreement)
            .options(_joinedload(Agreement.vehicle_segments))
            .filter(Agreement.customer_id == customer_user.customer.id)
            .order_by(Agreement.created_at.desc())
            .limit(5)
            .all()
        )
        if not agreements:
            await self._send_message(chat_id, "You have no bookings yet.\nVisit our website to book a car!")
            return

        status_labels = {
            "booking_requested": "Pending Review",
            "pending_payment": "Confirmed – Pay at Pickup",
            "active": "Active",
            "returned": "Returned",
            "closed": "Closed",
            "cancelled": "Cancelled",
            "overdue": "Overdue",
        }
        now = datetime.now(timezone.utc)
        lines = ["Your recent bookings:\n"]
        for a in agreements:
            status = status_labels.get(a.status.value if hasattr(a.status, 'value') else a.status, str(a.status))
            pickup = a.pickup_datetime.strftime("%d %b %Y") if a.pickup_datetime else "—"
            return_dt = as_business_naive(a.expected_return_datetime)
            days_left_str = ""
            if a.status.value == "active":
                diff = (return_dt - business_now()).total_seconds()
                if diff < 0:
                    days_left_str = "\n  ⚠️ OVERDUE"
                else:
                    days_left = int(diff // 86400)
                    days_left_str = f"\n  ⏰ {days_left} day(s) left · Due {return_dt.strftime('%d %b %Y')}"
            # What it costs. The card showed only the daily rate, so a
            # customer could not see the estimate they had agreed to, what
            # they still owed, or the deposit due at pickup.
            if a.status == AgreementStatus.BOOKING_REQUESTED:
                tier_vehicle = next(
                    (seg.vehicle for seg in a.vehicle_segments if seg.vehicle is not None),
                    None,
                )
                est_days, estimate = billing_service.calculate_rental_charge(
                    a.pickup_datetime,
                    a.expected_return_datetime,
                    a.agreed_daily_rate,
                    tier_vehicle.weekly_rate if tier_vehicle else None,
                    tier_vehicle.monthly_rate if tier_vehicle else None,
                )
                money = (
                    f"  Estimated total: {estimate:,.2f} ETB "
                    f"({est_days} day{'s' if est_days != 1 else ''}, "
                    "confirmed on approval)"
                )
            else:
                breakdown = agreement_service.get_balance_breakdown(db, a.id)
                money = (
                    f"  Total: {breakdown['total_charges']:,.2f} ETB · "
                    f"Paid: {breakdown['total_payments']:,.2f} ETB · "
                    f"Balance: {breakdown['balance_due']:,.2f} ETB"
                )
                if a.deposit_amount and a.deposit_amount > 0:
                    money += f"\n  Deposit: {a.deposit_amount:,.2f} ETB"

            location = (
                f"\n  Pickup location: {escape(a.pickup_location)}"
                if a.pickup_location
                else ""
            )
            lines.append(
                f"• {escape(a.agreement_number)} — {escape(status)}{days_left_str}\n"
                f"  Pickup: {pickup} 09:00{location}\n"
                f"  Rate: {a.agreed_daily_rate} ETB/day\n"
                f"{money}"
            )
        lines.append(
            "\nUse /extend to extend an active rental, "
            "or /cancelbook REF to cancel one."
        )
        await self._send_message(chat_id, "\n\n".join(lines))

    async def _start_extend_booking(self, db, customer_user: CustomerUser, chat_id: int) -> None:
        """Begin extend-rental flow: list active agreements customer can extend."""
        db.refresh(customer_user)
        agreements = (
            db.query(Agreement)
            .filter(
                Agreement.customer_id == customer_user.customer.id,
                Agreement.status.in_([AgreementStatus.ACTIVE, AgreementStatus.PENDING_PAYMENT, AgreementStatus.BOOKING_REQUESTED]),
            )
            .order_by(Agreement.created_at.desc())
            .all()
        )
        if not agreements:
            await self._send_message(chat_id, "You have no active bookings to extend.")
            return

        now = datetime.now(timezone.utc)
        lines = ["Which booking would you like to extend?\n"]
        for i, a in enumerate(agreements, 1):
            return_dt = as_business_naive(a.expected_return_datetime)
            diff = (return_dt - business_now()).total_seconds()
            days_left = max(0, int(diff // 86400))
            lines.append(f"{i}. {escape(a.agreement_number)} — due {return_dt.strftime('%d %b %Y')} ({days_left}d left)")

        lines.append("\nReply with the number (e.g. 1), or /cancel to abort.")
        self._extend_states[chat_id] = {
            "step": "pick",
            "agreements": [a.id for a in agreements],
            "agreement_numbers": [a.agreement_number for a in agreements],
            "customer_id": customer_user.customer.id,
        }
        await self._send_message(chat_id, "\n".join(lines))

    async def _handle_extend_message(self, chat_id: int, text: str) -> None:
        """Handle extend flow messages."""
        state = self._extend_states.get(chat_id)
        if not state:
            return

        db = SessionLocal()
        try:
            if state["step"] == "pick":
                try:
                    idx = int(text.strip()) - 1
                    agreement_id = state["agreements"][idx]
                    agreement_number = state["agreement_numbers"][idx]
                except (ValueError, IndexError):
                    await self._send_message(chat_id, "Invalid choice. Reply with a number from the list.")
                    return

                state["step"] = "new_date"
                state["agreement_id"] = agreement_id
                state["agreement_number"] = agreement_number

                agreement = db.query(Agreement).filter(Agreement.id == agreement_id).first()
                current = agreement.expected_return_datetime
                if current.tzinfo is None:
                    current = current.replace(tzinfo=timezone.utc)
                await self._send_message(
                    chat_id,
                    f"Extending {escape(agreement_number)}.\n"
                    f"Current return date: {format_business_datetime(current, '%d %b %Y %H:%M')}\n\n"
                    f"Enter new return date (DD/MM/YYYY HH:MM or DD/MM/YYYY):"
                )

            elif state["step"] == "new_date":
                raw = text.strip()
                new_dt = None
                try:
                    new_dt = datetime.strptime(raw, "%d/%m/%Y %H:%M").replace(tzinfo=timezone.utc)
                except ValueError:
                    try:
                        # Date only — default to 23:59 so any same-day current time still passes
                        new_dt = datetime.strptime(raw, "%d/%m/%Y").replace(
                            hour=23, minute=59, second=0, tzinfo=timezone.utc
                        )
                    except ValueError:
                        pass
                if new_dt is None:
                    await self._send_message(chat_id, "Invalid date. Use DD/MM/YYYY or DD/MM/YYYY HH:MM")
                    return

                agreement = db.query(Agreement).filter(Agreement.id == state["agreement_id"]).first()
                if not agreement:
                    await self._send_message(chat_id, "Booking not found.")
                    self._extend_states.pop(chat_id, None)
                    return

                current = agreement.expected_return_datetime
                if current.tzinfo is None:
                    current = current.replace(tzinfo=timezone.utc)

                if new_dt <= current:
                    await self._send_message(chat_id, "New date must be after the current return date. Try again:")
                    return

                # Check availability
                from src.repositories import availability_repository
                segment = next((s for s in agreement.vehicle_segments if s.vehicle_id is not None), None)
                if segment:
                    # Extension: the agreement already holds this vehicle, so RENTED
                    # is expected and the status gate would reject its own rental.
                    available = availability_repository.check_vehicle_available(
                        db, segment.vehicle_id, current, new_dt,
                        exclude_agreement_id=agreement.id, skip_status_check=True,
                    )
                    if not available:
                        await self._send_message(
                            chat_id,
                            "Sorry, the vehicle is already booked during that period.\n"
                            "Please choose an earlier date:"
                        )
                        return
                    segment.end_datetime = new_dt

                agreement.expected_return_datetime = new_dt
                agreement.return_reminder_sent_days = None

                # Post extension charge if agreement already has a charge on it
                ext_charge_msg = ""
                if agreement.status in (AgreementStatus.PENDING_PAYMENT, AgreementStatus.ACTIVE):
                    from src.services import billing_service, ledger_service
                    from src.models.ledger_entry import LedgerEntryType
                    ext_days, ext_charge = billing_service.calculate_rental_charge(
                        current, new_dt, agreement.agreed_daily_rate
                    )
                    ledger_service.post_charge(
                        db=db,
                        agreement_id=agreement.id,
                        amount=ext_charge,
                        description=f"Extension charge: +{ext_days} day(s) @ {agreement.agreed_daily_rate}/day",
                        entry_type=LedgerEntryType.CHARGE,
                        auto_commit=False,
                    )
                    ext_charge_msg = f"\n💳 Extension charge: +{ext_days} days = {ext_charge:,.0f} ETB added to your balance."

                db.commit()

                self._extend_states.pop(chat_id, None)
                await self._send_message(
                    chat_id,
                    f"Done! {escape(state['agreement_number'])} extended to {format_business_datetime(new_dt, '%d %b %Y %H:%M')}.{ext_charge_msg}\n"
                    f"Use /mybookings to see your updated bookings."
                )
        except Exception as exc:
            logger.exception("Extend flow error: %s", exc)
            await self._send_message(chat_id, f"Error: {escape(str(exc))}")
            self._extend_states.pop(chat_id, None)
        finally:
            db.close()

    def _get_customer_chat_id(self, db, customer_id: int) -> int | None:
        """Return the Telegram chat_id for a customer, or None if not linked."""
        customer_user = db.query(CustomerUser).filter(CustomerUser.customer_id == customer_id).first()
        if not customer_user:
            return None
        link = (
            db.query(TelegramCustomerLink)
            .filter(
                TelegramCustomerLink.customer_user_id == customer_user.id,
                TelegramCustomerLink.is_active.is_(True),
            )
            .first()
        )
        return link.chat_id if link else None

    async def notify_customer(self, db, customer_id: int, text: str) -> None:
        """Message a customer, if they have linked Telegram.

        A notification must never break the business action that triggered
        it: an unreachable Telegram cannot roll back an approval or a
        payment, so every failure here is logged and swallowed.
        """
        if not self.enabled:
            return
        try:
            chat_id = self._get_customer_chat_id(db, customer_id)
            if chat_id:
                await self._send_message(chat_id, text)
        except Exception as exc:
            logger.warning("Could not notify customer %s: %s", customer_id, exc)

    def notify_customer_soon(self, db, customer_id: int, text: str) -> None:
        """Queue a customer notification from synchronous service code.

        The services that approve bookings and post payments are sync, and
        the send is fire-and-forget by design — the ledger row is the record
        that matters, the message is a courtesy.
        """
        if not self.enabled:
            return
        coro = self.notify_customer(db, customer_id, text)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No event loop (a CLI, a test, a sync worker): run it inline.
            try:
                asyncio.run(coro)
            except Exception as exc:
                logger.warning("Could not notify customer %s: %s", customer_id, exc)
            return
        task = loop.create_task(coro)
        self._pending_notifications.add(task)
        task.add_done_callback(self._pending_notifications.discard)

    async def _send_return_reminders(self) -> None:
        """Send countdown and overdue notifications for active agreements."""
        # Business dates carry no offset, so they must be compared against a
        # wall-clock now. Treating them as UTC shifted every comparison by
        # three hours: a rental due in two hours was announced as overdue,
        # and a genuinely late one was not flagged until three hours after.
        now = business_now()
        db = SessionLocal()
        try:
            active = db.query(Agreement).filter(Agreement.status == AgreementStatus.ACTIVE).all()
            for agreement in active:
                return_dt = as_business_naive(agreement.expected_return_datetime)

                diff_seconds = (return_dt - now).total_seconds()

                if diff_seconds < 0 and not agreement.overdue_notified_at:
                    chat_id = self._get_customer_chat_id(db, agreement.customer_id)
                    if chat_id:
                        hours_overdue = int(abs(diff_seconds) // 3600)
                        await self._send_message(
                            chat_id,
                            f"🚨 OVERDUE — {escape(agreement.agreement_number)}\n"
                            f"Your rental was due {hours_overdue}h ago.\n"
                            f"Please return the car or contact us immediately.\n"
                            f"📞 Call us to arrange an extension."
                        )
                    agreement.overdue_notified_at = datetime.now(timezone.utc)
                    agreement.status = AgreementStatus.OVERDUE
                    db.commit()

                elif 0 <= diff_seconds <= 5 * 86400:
                    days_left = int(diff_seconds // 86400)
                    last_sent = agreement.return_reminder_sent_days
                    if last_sent is None or last_sent > days_left:
                        chat_id = self._get_customer_chat_id(db, agreement.customer_id)
                        if chat_id:
                            emoji = "🔴" if days_left <= 1 else ("🟡" if days_left <= 3 else "🟢")
                            await self._send_message(
                                chat_id,
                                f"{emoji} Reminder — {escape(agreement.agreement_number)}\n"
                                f"Your car is due in {days_left} day(s) on {format_business_datetime(return_dt, '%d %b %Y %H:%M')}.\n"
                                f"Need more time? Send /extend to request an extension."
                            )
                        agreement.return_reminder_sent_days = days_left
                        db.commit()
        except Exception as exc:
            logger.error("Return reminder error: %s", exc)
        finally:
            db.close()

    async def _notification_loop(self) -> None:
        """Run return reminders every hour."""
        # Initial delay so the bot is fully started before first check
        await asyncio.sleep(30)
        while not self._stop_event.is_set():
            try:
                await self._send_return_reminders()
            except Exception as exc:
                logger.error("Notification loop error: %s", exc)
            # Sleep 1 hour in small chunks so stop_event can interrupt
            for _ in range(360):
                if self._stop_event.is_set():
                    return
                await asyncio.sleep(10)

    async def _send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
    ) -> None:
        """Send a Telegram message, optionally with a keyboard.

        Buttons are how a phone conversation avoids a keyboard: tapping is
        one action, typing a number is a dozen and can go wrong.
        """
        if not self.enabled:
            return
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text[:4096]}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        try:
            await self._api("sendMessage", payload)
        except Exception as exc:
            logger.error("Telegram sendMessage failed for chat %s: %s", chat_id, exc)

    async def _api(self, method: str, payload: dict[str, Any]) -> Any:
        """Call the Telegram Bot API."""
        if self._client is None:
            raise RuntimeError("Telegram client is not initialized")

        response = await self._client.post(method, json=payload)
        response.raise_for_status()
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("description", "Telegram API call failed"))
        return data.get("result")


telegram_bot_service = TelegramBotService()
