"""Capturing a phone number without anyone typing it.

Telegram can hand over the number attached to the account in one tap. That
removes the worst typing step in registration and closes the validation
hole behind it: a shared contact is a number Telegram holds, not a string
someone typed, so "notaphone" cannot arrive this way.

Non-text messages were dropped entirely — a shared contact, a photo or a
voice note produced no reply at all — so the handling is tested here too.
"""
import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramStaffLink
from src.services.telegram_bot_service import TelegramBotService

CHAT = 9500


@pytest.fixture
def service(monkeypatch, db: Session):
    from src.services import telegram_bot_service as mod

    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    monkeypatch.setattr(mod, "SessionLocal", lambda: db)
    svc._send_message = AsyncMock()
    return svc


def text(service) -> str:
    return "\n".join(str(c.args[1]) for c in service._send_message.await_args_list)


def keyboards(service) -> list:
    """Every reply_markup the bot attached."""
    return [
        c.kwargs.get("reply_markup")
        for c in service._send_message.await_args_list
        if c.kwargs.get("reply_markup")
    ]


@pytest.fixture
def staff(db: Session, service) -> TelegramBotService:
    user = StaffUser(
        username="contact_admin",
        email="contact@nod.et",
        full_name="Contact Admin",
        hashed_password=hash_password("testpass123"),
        role=Role.ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramStaffLink(
            staff_user_id=user.id, telegram_user_id=9501, chat_id=CHAT, is_active=True
        )
    )
    db.commit()
    return service


def send_text(service, body: str) -> None:
    asyncio.run(
        service._process_update({
            "message": {
                "chat": {"id": CHAT},
                "from": {"id": 9501, "username": "admin"},
                "text": body,
            }
        })
    )


def send_contact(service, phone: str, first_name: str = "Shared") -> None:
    asyncio.run(
        service._process_update({
            "message": {
                "chat": {"id": CHAT},
                "from": {"id": 9501, "username": "admin"},
                "contact": {"phone_number": phone, "first_name": first_name},
            }
        })
    )


class TestTheRegistrationPromptOffersTheButton:
    def test_the_phone_step_attaches_a_contact_keyboard(self, db: Session, staff):
        asyncio.run(staff._handle_command(CHAT, 9501, "admin", "/register_customer"))
        send_text(staff, "Button")
        send_text(staff, "Test")

        markup = keyboards(staff)
        assert markup, "no keyboard offered at the phone step"
        buttons = markup[-1].get("keyboard", [])
        flat = [b for row in buttons for b in row]
        assert any(b.get("request_contact") for b in flat), markup[-1]

    def test_typing_the_number_still_works(self, db: Session, staff):
        """The button is an offer, not a requirement."""
        asyncio.run(staff._handle_command(CHAT, 9501, "admin", "/register_customer"))
        for value in ("Typed", "Entry", "0911445577", "skip", "skip"):
            send_text(staff, value)
        send_text(staff, "CONFIRM")

        created = db.query(Customer).order_by(Customer.id.desc()).first()
        assert created.phone_primary == "+251911445577"


class TestASharedContactFillsThePhoneStep:
    def test_it_is_accepted_and_normalised(self, db: Session, staff):
        asyncio.run(staff._handle_command(CHAT, 9501, "admin", "/register_customer"))
        send_text(staff, "Contact")
        send_text(staff, "Shared")
        send_contact(staff, "+251911445566")
        send_text(staff, "skip")
        send_text(staff, "skip")
        send_text(staff, "CONFIRM")

        created = db.query(Customer).order_by(Customer.id.desc()).first()
        assert created is not None, text(staff)
        assert created.phone_primary == "+251911445566", created.phone_primary

    def test_a_number_without_its_plus_is_handled(self, db: Session, staff):
        """Telegram often sends 251911... with no leading +."""
        asyncio.run(staff._handle_command(CHAT, 9501, "admin", "/register_customer"))
        send_text(staff, "NoPlus")
        send_text(staff, "Case")
        send_contact(staff, "251911445588")
        send_text(staff, "skip")
        send_text(staff, "skip")
        send_text(staff, "CONFIRM")

        created = db.query(Customer).order_by(Customer.id.desc()).first()
        assert created.phone_primary == "+251911445588", created.phone_primary

    def test_a_foreign_number_is_refused_like_a_typed_one(self, db: Session, staff):
        before = db.query(Customer).count()

        asyncio.run(staff._handle_command(CHAT, 9501, "admin", "/register_customer"))
        send_text(staff, "Foreign")
        send_text(staff, "Contact")
        send_contact(staff, "+15550100123")

        assert "doesn't look like" in text(staff).lower(), text(staff)
        assert db.query(Customer).count() == before

    def test_the_duplicate_guard_still_applies(self, db: Session, staff):
        db.add(
            Customer(
                first_name="Existing",
                last_name="Record",
                phone_primary="+251911445599",
                id_type="national_id",
                id_number="CONTACT-DUP",
                is_active=True,
            )
        )
        db.commit()
        before = db.query(Customer).count()

        asyncio.run(staff._handle_command(CHAT, 9501, "admin", "/register_customer"))
        send_text(staff, "Dup")
        send_text(staff, "ViaContact")
        send_contact(staff, "+251911445599")

        assert "already belongs to" in text(staff).lower(), text(staff)
        assert db.query(Customer).count() == before


class TestNonTextMessagesAreNotSwallowed:
    def test_a_contact_outside_a_flow_gets_an_answer(self, db: Session, staff):
        """It used to produce no reply at all."""
        send_contact(staff, "+251911445566")

        assert staff._send_message.await_count >= 1, "a shared contact was ignored"

    @pytest.mark.parametrize(
        "payload",
        [
            {"photo": [{"file_id": "abc"}]},
            {"voice": {"file_id": "def"}},
            {"location": {"latitude": 9.0, "longitude": 38.7}},
            {"document": {"file_id": "ghi"}},
        ],
    )
    def test_other_non_text_input_gets_an_answer(self, db: Session, staff, payload):
        asyncio.run(
            staff._process_update({
                "message": {
                    "chat": {"id": CHAT},
                    "from": {"id": 9501, "username": "admin"},
                    **payload,
                }
            })
        )

        assert staff._send_message.await_count >= 1, f"{payload} was ignored"


class TestUnlinkedChatsGetAWayIn:
    """A dead end is never acceptable on a consumer surface.

    Bare text in an unlinked chat answered "Use /help to see available
    commands." — a pointer to another command rather than something to act
    on. /start is the one screen everyone reaches, so it carries the way in.
    """

    def test_start_offers_the_things_a_visitor_can_do(self, db: Session, service):
        asyncio.run(service._handle_start(9600))

        markup = keyboards(service)
        assert markup, "no keyboard on /start"
        flat = [b for row in markup[-1].get("keyboard", []) for b in row]
        labels = " ".join(b.get("text", "") for b in flat)
        assert "help" in labels.lower() or "link" in labels.lower(), labels
