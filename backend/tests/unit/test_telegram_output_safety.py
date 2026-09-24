"""What the bot prints into a Telegram chat, and how much of it.

Telegram stores chat history on its own servers and syncs it to every
device the account is signed into, outside whatever access control the web
app enforces. Two consequences are tested here: ID numbers must never be
printed in full, and a list must never grow long enough to be rejected by
Telegram's 4096-character message cap — which fails as silence, so staff
get no reply and no error.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.agreement import AgreementStatus
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service
from src.services.telegram_bot_service import TelegramBotService

#: Telegram rejects a sendMessage payload longer than this.
TELEGRAM_LIMIT = 4096


@pytest.fixture
def service(monkeypatch):
    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    svc._send_message = AsyncMock()
    return svc


def sent(service) -> list[str]:
    return [str(c.args[1]) for c in service._send_message.await_args_list]


def text(service) -> str:
    return "\n".join(sent(service))


@pytest.fixture
def admin(db: Session) -> StaffUser:
    u = StaffUser(
        username="tg_out",
        email="tg_out@nod.et",
        full_name="Out Put",
        hashed_password=hash_password("testpass123"),
        role=Role.ADMIN,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


class TestIdNumbersAreNeverPrintedInFull:
    @pytest.mark.parametrize("id_number", ["2233", "88", "1234865", "A1", "123456789012"])
    def test_whatever_its_length(self, db: Session, service, admin, id_number):
        """Masking was length-based, so a short ID printed in full."""
        db.add(
            Customer(
                first_name="Masking",
                last_name="Case",
                phone_primary="+251944000777",
                id_type="national_id",
                id_number=id_number,
                is_active=True,
            )
        )
        db.commit()

        asyncio.run(service._handle_customer_lookup(db, admin, 700, "Masking"))

        out = text(service)
        # Check the ID field itself: a phone number may legitimately contain
        # the same digits.
        id_field = out.split("ID ")[1].strip() if "ID " in out else ""
        assert id_field != id_number, f"printed the whole ID {id_number!r}: {out}"
        assert id_field.startswith("..."), out
        assert id_field == f"...{id_number[-4:]}", out


class TestListsCannotOverflowTelegram:
    def test_a_large_customer_search_is_capped_and_says_so(
        self, db: Session, service, admin
    ):
        for i in range(40):
            db.add(
                Customer(
                    first_name="Bulk",
                    last_name=f"Person{i:03d}",
                    phone_primary=f"+25191100{i:04d}",
                    id_type="national_id",
                    id_number=f"BULK-{i:05d}",
                    is_active=True,
                )
            )
        db.commit()

        asyncio.run(service._handle_customer_lookup(db, admin, 701, "Bulk"))

        for message in sent(service):
            assert len(message) <= TELEGRAM_LIMIT, len(message)
        assert "more" in text(service).lower(), (
            "capped the list without telling staff results were hidden"
        )

    def test_a_large_vehicle_search_is_capped_and_says_so(
        self, db: Session, service, admin, vendor: Vendor
    ):
        for i in range(40):
            db.add(
                Vehicle(
                    vendor_id=vendor.id,
                    plate_number=f"BULK-{i:04d}",
                    plate_code="01",
                    plate_city="AA",
                    make="Toyota",
                    model="Corolla",
                    year=2023,
                    color="White",
                    vehicle_type=VehicleType.SEDAN,
                    service_type="business",
                    daily_rate=Decimal("1500.00"),
                    status=VehicleStatus.AVAILABLE,
                    is_active=True,
                )
            )
        db.commit()

        asyncio.run(service._handle_vehicle_lookup(db, admin, 702, "Corolla"))

        for message in sent(service):
            assert len(message) <= TELEGRAM_LIMIT, len(message)
        assert "more" in text(service).lower()

    def test_due_today_is_capped(self, db: Session, service, admin, vendor: Vendor):
        """This one had no limit at all."""
        now = datetime.now()
        for i in range(25):
            vehicle = Vehicle(
                vendor_id=vendor.id,
                plate_number=f"DUE-{i:04d}",
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
            db.add(vehicle)
            db.commit()
            customer = Customer(
                first_name="Due",
                last_name=f"Today{i:03d}",
                phone_primary=f"+25192200{i:04d}",
                id_type="national_id",
                id_number=f"DUE-{i:05d}",
                is_active=True,
            )
            db.add(customer)
            db.commit()
            pickup = now + timedelta(days=11)
            agreement = agreement_service.create_standard_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                pickup_datetime=pickup,
                expected_return_datetime=pickup + timedelta(days=2),
                daily_rate=Decimal("1100.00"),
            )
            agreement.pickup_datetime = now - timedelta(days=2)
            agreement.expected_return_datetime = now.replace(hour=23, minute=0, second=0)
            agreement.status = AgreementStatus.ACTIVE
            db.commit()

        asyncio.run(service._handle_due_today(db, admin, 703))

        for message in sent(service):
            assert len(message) <= TELEGRAM_LIMIT, len(message)
        assert "more" in text(service).lower()


class TestTimesAreShownInBusinessTime:
    def test_overdue_does_not_print_utc(
        self, db: Session, service, admin, vendor: Vendor
    ):
        """Due times are when a late fee starts; UTC is three hours off."""
        vehicle = Vehicle(
            vendor_id=vendor.id,
            plate_number="TZ-0001",
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
        db.add(vehicle)
        customer = Customer(
            first_name="Zone",
            last_name="Case",
            phone_primary="+251933000111",
            id_type="national_id",
            id_number="TZ-00001",
            is_active=True,
        )
        db.add(customer)
        db.commit()

        now = datetime.now()
        pickup = now + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=2),
            daily_rate=Decimal("1100.00"),
        )
        agreement.pickup_datetime = now - timedelta(days=10)
        agreement.expected_return_datetime = now - timedelta(days=3)
        agreement.status = AgreementStatus.OVERDUE
        db.commit()

        asyncio.run(service._handle_overdue(db, admin, 704))

        out = text(service)
        assert "UTC" not in out, out
        assert "EAT" in out, out


class TestBareCommandsAndCodeShapedText:
    """Telegram's own UI drops arguments; the bot should recover.

    Typing "/customer 0923677823" and pressing Enter sends just "/customer"
    because the command-suggestion popup swallows the Enter. The argument
    vanished and the follow-up line got a generic /help pointer, so the
    lookup never happened and nothing explained why.
    """

    @pytest.fixture
    def linked(self, db: Session, service, monkeypatch, admin):
        from src.models.telegram import TelegramStaffLink
        from src.services import telegram_bot_service as mod

        monkeypatch.setattr(mod, "SessionLocal", lambda: db)
        db.add(
            TelegramStaffLink(
                staff_user_id=admin.id,
                telegram_user_id=5151,
                chat_id=800,
                is_active=True,
            )
        )
        db.commit()
        return service

    def test_a_bare_customer_command_waits_for_the_term(self, db: Session, linked):
        db.add(
            Customer(
                first_name="Findme",
                last_name="Please",
                phone_primary="+251923677823",
                id_type="national_id",
                id_number="FIND-0001",
                is_active=True,
            )
        )
        db.commit()

        asyncio.run(linked._handle_command(800, 5151, "admin", "/customer"))
        assert "send the name or phone" in text(linked).lower()

        # The next plain message is used as the argument.
        asyncio.run(
            linked._process_update({
                "message": {
                    "chat": {"id": 800},
                    "from": {"id": 5151, "username": "admin"},
                    "text": "0923677823",
                }
            })
        )
        assert "Findme" in text(linked), text(linked)

    def test_the_pending_state_is_consumed_once(self, db: Session, linked):
        asyncio.run(linked._handle_command(800, 5151, "admin", "/car"))
        asyncio.run(
            linked._process_update({
                "message": {
                    "chat": {"id": 800},
                    "from": {"id": 5151, "username": "admin"},
                    "text": "Yaris",
                }
            })
        )
        linked._send_message.reset_mock()

        # A second plain message must not be treated as another search.
        asyncio.run(
            linked._process_update({
                "message": {
                    "chat": {"id": 800},
                    "from": {"id": 5151, "username": "admin"},
                    "text": "hello",
                }
            })
        )
        assert "/help" in text(linked).lower()

    def test_cancel_clears_a_pending_search(self, db: Session, linked):
        asyncio.run(linked._handle_command(800, 5151, "admin", "/customer"))
        asyncio.run(linked._handle_command(800, 5151, "admin", "/cancel"))
        linked._send_message.reset_mock()

        asyncio.run(
            linked._process_update({
                "message": {
                    "chat": {"id": 800},
                    "from": {"id": 5151, "username": "admin"},
                    "text": "0923677823",
                }
            })
        )
        assert "Findme" not in text(linked)

    def test_a_code_shaped_message_suggests_link(self, db: Session, service):
        asyncio.run(
            service._process_update({
                "message": {
                    "chat": {"id": 801},
                    "from": {"id": 5252, "username": "someone"},
                    "text": "ATZURVFR",
                }
            })
        )
        assert "/link ATZURVFR" in text(service), text(service)


class TestRegistrationDoesNotCreateDuplicates:
    """Three records shared one phone number, spelled three ways.

    Registration checked id_number for duplicates but never the phone, and
    stored whatever format was typed, so "0923677823" and "+251923677823"
    became separate people. Staff searching an incoming caller's number then
    get several hits with no way to tell which is current, and the
    customer's agreements are split across them.
    """

    @pytest.fixture
    def linked(self, db: Session, service, monkeypatch, admin):
        from src.models.telegram import TelegramStaffLink
        from src.services import telegram_bot_service as mod

        monkeypatch.setattr(mod, "SessionLocal", lambda: db)
        db.add(
            TelegramStaffLink(
                staff_user_id=admin.id, telegram_user_id=6161, chat_id=900, is_active=True
            )
        )
        db.commit()
        return service

    def _register(self, linked, phone: str, first: str = "New") -> None:
        def send(body: str) -> None:
            asyncio.run(
                linked._process_update({
                    "message": {
                        "chat": {"id": 900},
                        "from": {"id": 6161, "username": "admin"},
                        "text": body,
                    }
                })
            )

        asyncio.run(linked._handle_command(900, 6161, "admin", "/register_customer"))
        for value in (first, "Person", phone, "skip", "skip"):
            send(value)
        send("CONFIRM")

    def test_the_same_number_in_another_format_is_refused(
        self, db: Session, linked
    ):
        db.add(
            Customer(
                first_name="Existing",
                last_name="Customer",
                phone_primary="+251923677823",
                id_type="national_id",
                id_number="DUP-0001",
                is_active=True,
            )
        )
        db.commit()
        before = db.query(Customer).count()

        self._register(linked, "0923677823")

        assert db.query(Customer).count() == before, (
            "created a second record for a number already on file"
        )
        assert "already" in text(linked).lower(), text(linked)

    def test_a_new_number_still_registers(self, db: Session, linked):
        before = db.query(Customer).count()

        self._register(linked, "0911445566", first="Fresh")

        assert db.query(Customer).count() == before + 1, text(linked)
        created = (
            db.query(Customer).order_by(Customer.id.desc()).first()
        )
        # Stored canonically, so the next search finds it either way.
        assert created.phone_primary == "+251911445566", created.phone_primary
