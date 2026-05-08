"""Telegram bot polling and notification delivery."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from html import escape
from typing import Any

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from src.core.config import settings
from src.core.db import SessionLocal
from src.core.logging import get_logger
from src.core.rbac import Permission, has_permission
from src.models.agreement import Agreement, AgreementStatus
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramStaffLink
from src.models.vehicle import Vehicle
from src.services import agreement_service, telegram_link_service

logger = get_logger(__name__)


@dataclass
class CustomerRegistrationState:
    """Ephemeral chat state for guided customer creation."""

    step: str
    data: dict[str, str | None] = field(default_factory=lambda: {"business_type": "individual"})


class TelegramBotService:
    """Polling-based Telegram bot worker for staff operations."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._offset: int | None = None
        self._client: httpx.AsyncClient | None = None
        self._registration_states: dict[int, CustomerRegistrationState] = {}

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

    async def _poll_loop(self) -> None:
        """Long-poll Telegram for updates."""
        while not self._stop_event.is_set():
            try:
                updates = await self._get_updates()
                for update in updates:
                    self._offset = update["update_id"] + 1
                    await self._process_update(update)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Telegram polling error: %s", exc)
                await asyncio.sleep(3)

    async def _set_commands(self) -> None:
        """Register the bot command menu."""
        if not self.enabled:
            return

        commands = [
            {"command": "start", "description": "Start the staff bot"},
            {"command": "help", "description": "Show available commands"},
            {"command": "link", "description": "Link your staff account"},
            {"command": "customer", "description": "Search customers"},
            {"command": "car", "description": "Search vehicles"},
            {"command": "due_today", "description": "List agreements due today"},
            {"command": "overdue", "description": "List overdue agreements"},
            {"command": "register_customer", "description": "Create a customer"},
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
            await self._send_message(chat_id, "Current action cancelled.")
            return

        db = SessionLocal()
        try:
            link = telegram_link_service.get_link_for_chat(db, chat_id)
            if not link:
                await self._send_message(
                    chat_id,
                    "This bot is staff-only. Generate a link code in the web app, then send /link CODE here.",
                )
                return
            link = telegram_link_service.touch_link(db, link, telegram_username)
            staff_user = (
                db.query(StaffUser)
                .filter(StaffUser.id == link.staff_user_id, StaffUser.is_active.is_(True))
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
        finally:
            db.close()

    async def _handle_start(self, chat_id: int) -> None:
        """Handle /start."""
        db = SessionLocal()
        try:
            link = telegram_link_service.get_link_for_chat(db, chat_id)
            if link:
                await self._send_message(
                    chat_id,
                    "Staff bot ready.\nUse /help for commands.",
                )
            else:
                username_suffix = f" (@{settings.telegram_bot_username})" if settings.telegram_bot_username else ""
                await self._send_message(
                    chat_id,
                    "This is a staff-only rental operations bot"
                    f"{username_suffix}.\nGenerate a link code in the web app, then send /link CODE here.",
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
        """Handle /link CODE."""
        if not arg:
            await self._send_message(chat_id, "Usage: /link CODE")
            return

        db = SessionLocal()
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
                f"Linked successfully to staff account {escape(staff_user.username)}.",
            )
        except Exception as exc:
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
            await self._send_message(chat_id, "Usage: /customer NAME_OR_PHONE")
            return

        search_term = f"%{search}%"
        customers = (
            db.query(Customer)
            .filter(Customer.is_active.is_(True))
            .filter(
                or_(
                    Customer.first_name.ilike(search_term),
                    Customer.last_name.ilike(search_term),
                    Customer.phone_primary.ilike(search_term),
                    Customer.id_number.ilike(search_term),
                )
            )
            .order_by(Customer.first_name, Customer.last_name)
            .limit(5)
            .all()
        )
        if not customers:
            await self._send_message(chat_id, "No matching customers found.")
            return

        lines = ["Customer matches:"]
        for customer in customers:
            masked_id = (
                f"...{customer.id_number[-4:]}" if customer.id_number and len(customer.id_number) > 4 else customer.id_number
            )
            lines.append(
                f"{customer.id}: {escape(customer.full_name)} | {escape(customer.phone_primary)}"
                + (f" | ID {escape(masked_id)}" if masked_id else "")
            )
        await self._send_message(chat_id, "\n".join(lines))

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
            await self._send_message(chat_id, "Usage: /car PLATE_OR_MODEL")
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
            .limit(5)
            .all()
        )
        if not vehicles:
            await self._send_message(chat_id, "No matching vehicles found.")
            return

        lines = ["Vehicle matches:"]
        for vehicle in vehicles:
            lines.append(
                f"{escape(vehicle.plate_number)} | {escape(vehicle.make)} {escape(vehicle.model)} {vehicle.year}"
                f" | {vehicle.status.value} | ETB {vehicle.daily_rate}"
            )
        await self._send_message(chat_id, "\n".join(lines))

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

        lines = ["Agreements due today:"]
        for agreement in due_today[:10]:
            lines.append(
                f"{escape(agreement.agreement_number)} | {escape(agreement.customer.full_name)} | "
                f"{agreement.expected_return_datetime.astimezone(timezone.utc).strftime('%H:%M UTC')}"
            )
        await self._send_message(chat_id, "\n".join(lines))

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
            .limit(10)
            .all()
        )
        if not agreements:
            await self._send_message(chat_id, "No overdue agreements found.")
            return

        lines = ["Overdue agreements:"]
        for agreement in agreements:
            summary = agreement_service.get_agreement_summary(db, agreement.id)
            balance_due = summary["balance_due"]
            lines.append(
                f"{escape(agreement.agreement_number)} | {escape(agreement.customer.full_name)} | "
                f"due {agreement.expected_return_datetime.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | "
                f"balance ETB {balance_due}"
            )
        await self._send_message(chat_id, "\n".join(lines))

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

                customer = Customer(
                    business_type="individual",
                    first_name=state.data["first_name"] or "",
                    last_name=state.data["last_name"] or "",
                    phone_primary=state.data["phone_primary"] or "",
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
