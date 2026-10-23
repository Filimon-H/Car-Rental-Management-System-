"""Staff and customer sides of the bot must not reach each other.

It is one bot with two roles, not two bots, so the separation is entirely
a property of the dispatch logic. Every crossing is asserted here: staff
tooling from a customer chat, customer tooling from a staff chat, and the
data each role is allowed to see.
"""
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.agreement import AgreementStatus
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.staff_user import StaffUser
from src.models.telegram import TelegramCustomerLink, TelegramStaffLink
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service
from src.services.telegram_bot_service import TelegramBotService

STAFF_CHAT = 9100
CUSTOMER_CHAT = 9200

STAFF_ONLY = ["/customer Secret", "/car Yaris", "/due_today", "/overdue", "/register_customer"]
CUSTOMER_ONLY = ["/book", "/mybookings", "/extend", "/cancelbook AGR-1"]


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


@pytest.fixture
def car(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="SEP-0001",
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
    db.refresh(v)
    return v


@pytest.fixture
def other_customer(db: Session) -> Customer:
    """Someone whose data must never surface in a customer's chat."""
    c = Customer(
        first_name="Secret",
        last_name="Client",
        phone_primary="+251977000222",
        id_type="national_id",
        id_number="SEP-SECRET-1",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def staff_chat(db: Session, service) -> TelegramBotService:
    user = StaffUser(
        username="sep_admin",
        email="sep_admin@nod.et",
        full_name="Sep Admin",
        hashed_password=hash_password("testpass123"),
        role=Role.ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramStaffLink(
            staff_user_id=user.id, telegram_user_id=9101, chat_id=STAFF_CHAT, is_active=True
        )
    )
    db.commit()
    return service


@pytest.fixture
def customer_chat(db: Session, service) -> Customer:
    c = Customer(
        first_name="Sep",
        last_name="Customer",
        phone_primary="+251977000111",
        id_type="national_id",
        id_number="SEP-CUST-1",
        license_number="DL-SEP-1",
        license_expiry=datetime.now() + timedelta(days=900),
        is_active=True,
    )
    db.add(c)
    db.commit()
    user = CustomerUser(
        customer_id=c.id,
        email="sepcustomer@example.com",
        hashed_password=hash_password("pass12345"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramCustomerLink(
            customer_user_id=user.id,
            telegram_user_id=9201,
            chat_id=CUSTOMER_CHAT,
            is_active=True,
        )
    )
    db.commit()
    return c


def send(service, chat: int, user: int, body: str) -> None:
    asyncio.run(
        service._process_update({
            "message": {
                "chat": {"id": chat},
                "from": {"id": user, "username": "who"},
                "text": body,
            }
        })
    )


class TestCustomersCannotReachStaffTooling:
    @pytest.mark.parametrize("command", STAFF_ONLY)
    def test_a_staff_command_returns_no_staff_data(
        self, db: Session, service, customer_chat, other_customer, car, command
    ):
        send(service, CUSTOMER_CHAT, 9201, command)

        out = text(service)
        # None of the staff report headers may appear.
        for header in (
            "Customer matches:",
            "Vehicle matches:",
            "Overdue agreements:",
            "Agreements due today:",
        ):
            assert header not in out, f"{command} produced staff output: {out}"
        # Nor another customer's details.
        for leak in ("Secret", "SEP-SECRET-1", "+251977000222", "SEP-0001"):
            assert leak not in out, f"{command} leaked {leak!r}"

    def test_registration_state_is_not_started(
        self, db: Session, service, customer_chat
    ):
        """A customer must not be dropped into the staff create-customer flow."""
        send(service, CUSTOMER_CHAT, 9201, "/register_customer")
        assert CUSTOMER_CHAT not in service._registration_states

    def test_a_pending_staff_search_is_not_started(
        self, db: Session, service, customer_chat
    ):
        send(service, CUSTOMER_CHAT, 9201, "/customer")
        assert CUSTOMER_CHAT not in service._pending_search_states


class TestStaffCannotUseCustomerTooling:
    @pytest.mark.parametrize("command", CUSTOMER_ONLY)
    def test_a_customer_command_is_not_served(
        self, db: Session, service, staff_chat, car, command
    ):
        send(service, STAFF_CHAT, 9101, command)

        out = text(service)
        assert "Available cars" not in out, f"{command} started a booking: {out}"
        assert STAFF_CHAT not in service._booking_states
        assert STAFF_CHAT not in service._extend_states


class TestEachSideSeesOnlyItsOwnData:
    def test_mybookings_shows_only_the_linked_customer(
        self, db: Session, service, customer_chat, other_customer, car
    ):
        pickup = datetime.now() + timedelta(days=11)
        theirs = agreement_service.create_standard_agreement(
            db=db,
            customer_id=other_customer.id,
            vehicle_id=car.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=car.daily_rate,
        )
        theirs.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()
        their_number = theirs.agreement_number

        send(service, CUSTOMER_CHAT, 9201, "/mybookings")

        assert their_number not in text(service), "saw another customer's booking"

    def test_help_offers_a_customer_their_own_commands(
        self, db: Session, service, customer_chat
    ):
        """A linked customer was shown only /start, /link, /help.

        _handle_help resolved the staff link and treated its absence as
        "not linked at all", so the four commands a customer can actually
        run were never listed for them.
        """
        send(service, CUSTOMER_CHAT, 9201, "/help")

        out = text(service)
        assert "/book" in out, out
        assert "/mybookings" in out, out

    def test_help_does_not_offer_staff_commands_to_a_customer(
        self, db: Session, service, customer_chat
    ):
        send(service, CUSTOMER_CHAT, 9201, "/help")

        out = text(service)
        for staff_cmd in ("/customer", "/overdue", "/due_today", "/register_customer"):
            assert staff_cmd not in out, f"offered {staff_cmd} to a customer: {out}"

    def test_help_offers_staff_their_commands(self, db: Session, service, staff_chat):
        send(service, STAFF_CHAT, 9101, "/help")

        out = text(service)
        assert "/overdue" in out
        assert "/book" not in out, "offered the customer booking flow to staff"


class TestLinkCodesDoNotCrossRoles:
    def test_a_staff_chat_is_not_also_a_customer(
        self, db: Session, service, staff_chat
    ):
        """Staff link is checked first; a staff chat must stay staff-only."""
        send(service, STAFF_CHAT, 9101, "/mybookings")
        assert "Your bookings" not in text(service)


class TestAChatCannotHoldBothRolesAtOnce:
    """If both links existed, staff-first ordering decides silently.

    Linking as staff clears prior staff links for the chat but not a
    customer link, and vice versa. A chat holding both would be routed as
    staff with the customer side unreachable and no indication why.
    """

    def test_linking_as_staff_clears_a_customer_link(
        self, db: Session, service, customer_chat
    ):
        from src.core.rbac import Role as R
        from src.services import telegram_link_service

        user = StaffUser(
            username="both_roles",
            email="both@nod.et",
            full_name="Both Roles",
            hashed_password=hash_password("testpass123"),
            role=R.ADMIN,
            is_active=True,
        )
        db.add(user)
        db.commit()

        code = telegram_link_service.create_link_code(db, user.id)
        telegram_link_service.consume_link_code(
            db, code.code, telegram_user_id=9201, chat_id=CUSTOMER_CHAT, telegram_username="who"
        )

        remaining = (
            db.query(TelegramCustomerLink)
            .filter(
                TelegramCustomerLink.chat_id == CUSTOMER_CHAT,
                TelegramCustomerLink.is_active.is_(True),
            )
            .count()
        )
        assert remaining == 0, (
            "chat holds both a staff and a customer link; staff-first routing "
            "would silently hide the customer side"
        )

    def test_linking_as_a_customer_clears_a_staff_link(
        self, db: Session, service, staff_chat
    ):
        """The same must hold in the other direction."""
        from src.models.telegram import TelegramCustomerLinkCode

        c = Customer(
            first_name="Switch",
            last_name="Role",
            phone_primary="+251977000333",
            id_type="national_id",
            id_number="SWITCH-1",
            is_active=True,
        )
        db.add(c)
        db.commit()
        user = CustomerUser(
            customer_id=c.id,
            email="switch@example.com",
            hashed_password=hash_password("pass12345"),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.add(
            TelegramCustomerLinkCode(
                customer_user_id=user.id,
                code="SWITCH99",
                expires_at=datetime.now() + timedelta(hours=1),
            )
        )
        db.commit()

        send(service, STAFF_CHAT, 9101, "/link SWITCH99")

        remaining = (
            db.query(TelegramStaffLink)
            .filter(TelegramStaffLink.chat_id == STAFF_CHAT)
            .count()
        )
        assert remaining == 0, (
            "chat kept its staff link after linking as a customer"
        )


class TestTheMenuMatchesWhatTheChatCanDo:
    """Telegram's menu listed 13 commands; /help listed 9.

    The four extras are customer commands, and tapping one in a staff chat
    answered "Unknown command. Use /help." — which reads as a typo rather
    than what it is, a command meant for the other role.
    """

    @pytest.mark.parametrize("command", ["/book", "/mybookings", "/extend", "/cancelbook"])
    def test_staff_are_told_who_the_command_is_for(
        self, db: Session, service, staff_chat, command
    ):
        send(service, STAFF_CHAT, 9101, command)

        out = text(service).lower()
        assert "unknown command" not in out, (
            f"{command} reported a role mismatch as a typo: {out}"
        )
        assert "customer" in out, out

    def test_a_typo_is_still_reported_as_one(self, db: Session, service, staff_chat):
        send(service, STAFF_CHAT, 9101, "/foobar")

        out = text(service).lower()
        assert "unknown command" in out, out

    def test_each_role_gets_its_own_menu(self, db: Session, service):
        """Scoped command lists, so a chat only sees what it can run."""
        staff = service._commands_for_role("staff")
        customer = service._commands_for_role("customer")

        staff_names = {c["command"] for c in staff}
        customer_names = {c["command"] for c in customer}

        assert "overdue" in staff_names
        assert "book" not in staff_names, "staff menu offers the customer booking flow"
        assert "book" in customer_names
        assert "overdue" not in customer_names, "customer menu offers staff tooling"
        # Both keep the universal ones.
        for shared in ("start", "help", "cancel"):
            assert shared in staff_names and shared in customer_names

    def test_an_already_linked_chat_gets_its_menu_without_relinking(
        self, db: Session, service, staff_chat, monkeypatch
    ):
        """Menus are scoped at link time, which existing chats already passed.

        Without a backfill they fall back to the unlinked default and a
        staff member silently loses their commands from the menu.
        """
        scoped: list[tuple[int, str]] = []

        async def record(chat_id, role):
            scoped.append((chat_id, role))

        monkeypatch.setattr(service, "set_commands_for_chat", record)

        send(service, STAFF_CHAT, 9101, "/help")

        assert (STAFF_CHAT, "staff") in scoped, (
            "a linked chat never gets its scoped menu"
        )
