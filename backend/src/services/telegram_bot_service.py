"""Telegram bot polling and notification delivery."""

from __future__ import annotations

import asyncio
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
from src.services import agreement_service, telegram_link_service

logger = get_logger(__name__)

#: Telegram rejects a sendMessage payload longer than this, and the failure
#: surfaces as silence: staff get no reply and no error. Stay well under it.
TELEGRAM_MESSAGE_LIMIT = 4096

#: Rows in any list command before truncating.
MAX_LIST_ROWS = 10


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
    tail = id_number[-4:]
    return f"...{tail}"


def _business_time(value: datetime) -> datetime:
    """A stored timestamp as Addis wall time."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(ZoneInfo(settings.scheduler_timezone))


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

    async def _set_commands(self) -> None:
        """Register the bot command menu."""
        if not self.enabled:
            return

        commands = [
            {"command": "start", "description": "Start the bot"},
            {"command": "help", "description": "Show available commands"},
            {"command": "link", "description": "Link your account (staff or customer)"},
            {"command": "book", "description": "Browse available cars and book one (customers)"},
            {"command": "mybookings", "description": "View your bookings (customers)"},
            {"command": "extend", "description": "Extend your active rental (customers)"},
            {"command": "cancelbook", "description": "Cancel a booking (customers)"},
            {"command": "customer", "description": "Search customers (staff)"},
            {"command": "car", "description": "Search vehicles (staff)"},
            {"command": "due_today", "description": "Agreements due today (staff)"},
            {"command": "overdue", "description": "Overdue agreements (staff)"},
            {"command": "register_customer", "description": "Create a customer (staff)"},
            {"command": "cancel", "description": "Cancel current action"},
        ]
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

        if not text or chat_id is None or telegram_user_id is None:
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
            self._registration_states.pop(chat_id, None)
            self._booking_states.pop(chat_id, None)
            self._extend_states.pop(chat_id, None)
            self._pending_search_states.pop(chat_id, None)
            await self._send_message(chat_id, "Current action cancelled.")
            return

        db = SessionLocal()
        try:
            # Check staff link first
            staff_link = telegram_link_service.get_link_for_chat(db, chat_id)
            if staff_link:
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
            await self._send_message(
                chat_id,
                f"Welcome to the car rental bot{username_suffix}!\n\n"
                "To get started, link your account:\n"
                "• Customers: go to My Bookings on the website → get a link code → send /link CODE\n"
                "• Staff: generate a link code in the web app → send /link CODE",
            )
        finally:
            db.close()

    async def _handle_help(self, chat_id: int) -> None:
        """Handle /help."""
        db = SessionLocal()
        try:
            link = telegram_link_service.get_link_for_chat(db, chat_id)
            if not link:
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
            await self._send_message(
                chat_id,
                f"Linked to customer account {escape(name)}.\nUse /mybookings to see your bookings.",
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
                await self._send_message(chat_id, "Send the primary phone number.")
            elif state.step == "phone_primary":
                state.data["phone_primary"] = text
                state.step = "id_number"
                await self._send_message(chat_id, "Send ID number, or /skip by sending SKIP.")
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
                    f"Phone: {escape(state.data['phone_primary'] or '')}\n"
                    f"ID: {escape(state.data['id_number'] or 'n/a')}\n"
                    f"License: {escape(state.data['driver_license_number'] or 'n/a')}",
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

        lines = ["Available cars — reply with the number to select:\n"]
        for i, v in enumerate(vehicles, 1):
            lines.append(
                f"{i}. {escape(v.make)} {escape(v.model)} {v.year} | "
                f"{v.vehicle_type} | {v.seats} seats | "
                f"ETB {v.daily_rate}/day"
            )
        lines.append("\nOr /cancel to stop.")

        self._booking_states[chat_id] = BookingState(
            step="pick_car",
            data={"vehicles": [{"id": v.id, "label": f"{v.make} {v.model} {v.year}", "rate": str(v.daily_rate)} for v in vehicles]},
        )
        await self._send_message(chat_id, "\n".join(lines))

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

                # Check if customer already has ID on file
                if customer.id_number and customer.license_number:
                    state.data["id_type"] = customer.id_type or "national_id"
                    state.data["id_number"] = customer.id_number
                    state.data["license_number"] = customer.license_number
                    state.step = "pickup_date"
                    await self._send_message(
                        chat_id,
                        f"Selected: {escape(chosen['label'])}\n\n"
                        f"ID and license on file ({escape(customer.id_number)}, license {escape(customer.license_number)}).\n\n"
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

                rate = Decimal(state.data["daily_rate"])
                total = rate * days

                state.step = "confirm"
                await self._send_message(
                    chat_id,
                    f"Booking summary:\n\n"
                    f"Car: {escape(state.data['vehicle_label'])}\n"
                    f"Pickup: {pickup.strftime('%d %b %Y')}\n"
                    f"Return: {ret.strftime('%d %b %Y')} ({days} day{'s' if days != 1 else ''})\n"
                    f"Estimated total: ETB {total:,.2f}\n"
                    f"ID: {escape(state.data['id_number'])} ({escape(state.data['id_type'].replace('_', ' '))})\n"
                    f"License: {escape(state.data['license_number'])}\n\n"
                    "Reply CONFIRM to submit, or /cancel.",
                )

            elif state.step == "confirm":
                if text.strip().upper() != "CONFIRM":
                    await self._send_message(chat_id, "Send CONFIRM to submit the booking, or /cancel.")
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
            return_dt = a.expected_return_datetime
            if return_dt.tzinfo is None:
                return_dt = return_dt.replace(tzinfo=timezone.utc)
            days_left_str = ""
            if a.status.value == "active":
                diff = (return_dt - now).total_seconds()
                if diff < 0:
                    days_left_str = "\n  ⚠️ OVERDUE"
                else:
                    days_left = int(diff // 86400)
                    days_left_str = f"\n  ⏰ {days_left} day(s) left · Due {return_dt.strftime('%d %b %Y')}"
            lines.append(
                f"• {escape(a.agreement_number)} — {escape(status)}{days_left_str}\n"
                f"  Pickup: {pickup}\n"
                f"  Rate: {a.agreed_daily_rate} ETB/day"
            )
        lines.append("\nUse /extend to extend an active rental.")
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
            return_dt = a.expected_return_datetime
            if return_dt.tzinfo is None:
                return_dt = return_dt.replace(tzinfo=timezone.utc)
            diff = (return_dt - now).total_seconds()
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
                    f"Current return date: {current.strftime('%d %b %Y %H:%M')} UTC\n\n"
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
                    f"Done! {escape(state['agreement_number'])} extended to {new_dt.strftime('%d %b %Y %H:%M')} UTC.{ext_charge_msg}\n"
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

    async def _send_return_reminders(self) -> None:
        """Send countdown and overdue notifications for active agreements."""
        now = datetime.now(timezone.utc)
        db = SessionLocal()
        try:
            active = db.query(Agreement).filter(Agreement.status == AgreementStatus.ACTIVE).all()
            for agreement in active:
                return_dt = agreement.expected_return_datetime
                if return_dt.tzinfo is None:
                    return_dt = return_dt.replace(tzinfo=timezone.utc)

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
                    agreement.overdue_notified_at = now
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
                                f"Your car is due in {days_left} day(s) on {return_dt.strftime('%d %b %Y %H:%M')} UTC.\n"
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

    async def _send_message(self, chat_id: int, text: str) -> None:
        """Send a plain text Telegram message."""
        if not self.enabled:
            return
        try:
            await self._api(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": text[:4096],
                },
            )
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
