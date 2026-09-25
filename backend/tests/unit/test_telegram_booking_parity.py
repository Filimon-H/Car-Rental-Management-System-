"""A booking made on Telegram must be the same booking as on the website.

The bot has its own implementation of the booking flow rather than calling
the shared path, so each web-side fix has to be carried across by hand. It
had drifted: times landed three hours out, the tier explanation and deposit
were missing, and the pickup/return locations and notes the web form
collects were never asked for at all.
"""
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.security import hash_password
from src.models.agreement import Agreement, AgreementStatus
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services.telegram_bot_service import TelegramBotService

CHAT = 9300


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
        plate_number="PAR-0001",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1100.00"),
        weekly_rate=Decimal("6500.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def linked(db: Session, service) -> Customer:
    c = Customer(
        first_name="Parity",
        last_name="Customer",
        phone_primary="+251988000111",
        id_type="national_id",
        id_number="PAR-CUST-1",
        license_number="DL-PAR-1",
        license_expiry=datetime.now() + timedelta(days=900),
        is_active=True,
    )
    db.add(c)
    db.commit()
    user = CustomerUser(
        customer_id=c.id,
        email="parity@example.com",
        hashed_password=hash_password("pass12345"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramCustomerLink(
            customer_user_id=user.id, telegram_user_id=9301, chat_id=CHAT, is_active=True
        )
    )
    db.commit()
    return c


def send(service, body: str) -> None:
    asyncio.run(
        service._process_update({
            "message": {
                "chat": {"id": CHAT},
                "from": {"id": 9301, "username": "parity"},
                "text": body,
            }
        })
    )


def book(service, car_index="1", days=7, **steps):
    """Drive the flow to just before CONFIRM."""
    pickup = datetime.now() + timedelta(days=11)
    send(service, "/book")
    send(service, car_index)
    send(service, pickup.strftime("%d/%m/%Y"))
    send(service, (pickup + timedelta(days=days)).strftime("%d/%m/%Y"))
    return pickup


class TestTimesMatchTheWebsite:
    def test_a_pickup_is_stored_as_local_wall_clock(
        self, db: Session, service, linked, car
    ):
        """The bot stored 09:00 UTC into a wall-clock column: 12:00 Addis.

        The same booking made on the website stores 09:00, so the two
        channels disagreed by the UTC offset on every single booking.
        """
        pickup = book(service, days=3)
        for extra in ("", "", "CONFIRM"):
            send(service, extra or "CONFIRM")

        agreement = db.query(Agreement).order_by(Agreement.id.desc()).first()
        assert agreement is not None, text(service)
        assert agreement.pickup_datetime.hour == 9, (
            f"stored {agreement.pickup_datetime}, expected 09:00 local"
        )


class TestTheQuoteExplainsItself:
    def test_the_tier_note_is_shown(self, db: Session, service, linked, car):
        """The web page says which tier applied; the bot showed a bare total."""
        book(service, days=7)
        out = text(service)
        assert "6,500" in out, out
        assert "tier" in out.lower(), f"no tier explanation: {out}"

    def test_the_summary_says_the_price_is_an_estimate(
        self, db: Session, service, linked, car
    ):
        """Reach the summary itself, past the location and notes prompts."""
        book(service, days=3)
        send(service, "skip")
        send(service, "skip")

        out = text(service).lower()
        assert "estimated total" in out, out
        assert "confirmed by our team" in out, out


class TestTheFlowCollectsWhatTheWebFormDoes:
    def test_it_asks_for_a_pickup_location(self, db: Session, service, linked, car):
        book(service, days=3)
        assert "pickup location" in text(service).lower(), text(service)

    def test_the_location_and_notes_reach_the_agreement(
        self, db: Session, service, linked, car
    ):
        book(service, days=3)
        send(service, "Bole Airport")
        send(service, "Please include a child seat")
        send(service, "CONFIRM")

        agreement = db.query(Agreement).order_by(Agreement.id.desc()).first()
        assert agreement is not None, text(service)
        assert agreement.pickup_location == "Bole Airport", agreement.pickup_location
        assert "child seat" in (agreement.notes or ""), agreement.notes

    def test_they_can_be_skipped(self, db: Session, service, linked, car):
        book(service, days=3)
        send(service, "skip")
        send(service, "skip")
        send(service, "CONFIRM")

        agreement = db.query(Agreement).order_by(Agreement.id.desc()).first()
        assert agreement is not None, text(service)
        assert agreement.status == AgreementStatus.BOOKING_REQUESTED


class TestTheBookingIsUsableAfterwards:
    def test_the_reference_and_next_step_are_given(
        self, db: Session, service, linked, car
    ):
        book(service, days=3)
        send(service, "skip")
        send(service, "skip")
        send(service, "CONFIRM")

        out = text(service)
        agreement = db.query(Agreement).order_by(Agreement.id.desc()).first()
        assert agreement.agreement_number in out
        assert "/mybookings" in out, out


class TestMyBookingsShowsTheMoney:
    """The card on the website shows what a booking costs; the bot did not.

    /mybookings listed only the daily rate, so a customer could not see the
    estimate they had agreed to, what they owed, or the deposit due — the
    same gap that was fixed on the web card.
    """

    def _requested(self, db, service, linked, car, days=7):
        pickup = datetime.now() + timedelta(days=11)
        send(service, "/book")
        send(service, "1")
        send(service, pickup.strftime("%d/%m/%Y"))
        send(service, (pickup + timedelta(days=days)).strftime("%d/%m/%Y"))
        send(service, "skip")
        send(service, "skip")
        send(service, "CONFIRM")
        service._send_message.reset_mock()

    def test_a_pending_booking_shows_its_estimate(
        self, db: Session, service, linked, car
    ):
        self._requested(db, service, linked, car, days=7)

        send(service, "/mybookings")
        out = text(service)
        # The weekly tier, not 7 x 1,100.
        assert "6,500" in out, out
        assert "7,700" not in out, out

    def test_an_approved_booking_shows_the_balance(
        self, db: Session, service, linked, car
    ):
        from src.services import agreement_service

        self._requested(db, service, linked, car, days=7)
        agreement = db.query(Agreement).order_by(Agreement.id.desc()).first()
        agreement_service.approve_booking_request(db, agreement.id)
        service._send_message.reset_mock()

        send(service, "/mybookings")
        out = text(service)
        assert "balance" in out.lower(), out
