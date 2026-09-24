"""The bot must refuse staff commands from an unlinked chat.

This is the assumption the whole bot rests on: anyone can find a public bot
and type /overdue or /customer. QA could not test it from an unlinked
Telegram account, so it is covered here at the dispatch level, which is
where the decision is actually made.
"""
import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramStaffLink
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services.telegram_bot_service import TelegramBotService

UNLINKED_CHAT = 999_001


@pytest.fixture
def service(monkeypatch, db: Session):
    from src.services import telegram_bot_service as mod

    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    monkeypatch.setattr(mod, "SessionLocal", lambda: db)
    svc._send_message = AsyncMock()
    return svc


def replies(service) -> str:
    return "\n".join(str(c.args[1]) for c in service._send_message.await_args_list)


@pytest.fixture
def secret_customer(db: Session) -> Customer:
    c = Customer(
        first_name="Hidden",
        last_name="Person",
        phone_primary="+251911000111",
        id_type="national_id",
        id_number="SECRET-ID-9",
        is_active=True,
    )
    db.add(c)
    db.commit()
    return c


@pytest.fixture
def secret_vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="SECRET-1",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1100.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    return v


class TestUnlinkedChatsGetNothing:
    @pytest.mark.parametrize(
        "command,arg",
        [
            ("/customer", "Hidden"),
            ("/car", "Yaris"),
            ("/overdue", ""),
            ("/due_today", ""),
            ("/register_customer", ""),
        ],
    )
    def test_a_staff_command_is_refused(
        self, service, db: Session, secret_customer, secret_vehicle, command, arg
    ):
        asyncio.run(
            service._handle_command(
                UNLINKED_CHAT, 4242, "stranger", f"{command} {arg}".strip()
            )
        )

        text = replies(service)
        assert "link" in text.lower(), text
        # Nothing about the data itself may leak.
        for leak in ("Hidden", "Person", "SECRET-ID-9", "SECRET-1", "+251911000111"):
            assert leak not in text, f"{command} leaked {leak!r} to an unlinked chat"

    def test_an_inactive_staff_account_is_refused(
        self, service, db: Session, secret_customer
    ):
        """Deactivating a user in the web app must cut off their bot too."""
        user = StaffUser(
            username="tg_gone",
            email="gone@nod.et",
            full_name="Former Staff",
            hashed_password=hash_password("testpass123"),
            role=Role.ADMIN,
            is_active=False,
        )
        db.add(user)
        db.commit()
        db.add(
            TelegramStaffLink(
                staff_user_id=user.id, telegram_user_id=4343, chat_id=999_002, is_active=True
            )
        )
        db.commit()

        asyncio.run(service._handle_command(999_002, 4343, "gone", "/customer Hidden"))

        text = replies(service)
        assert "inactive" in text.lower(), text
        assert "Hidden" not in text
