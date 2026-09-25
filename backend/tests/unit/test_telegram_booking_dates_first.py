"""Booking asks when, then shows what is free — not the other way round.

Picking a car first means a customer invests in a choice before finding
out the dates do not work. Asking for dates first means every car offered
is one they can actually have, and it removes the typed date format: the
common spans are buttons.
"""
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.security import hash_password
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.agreement_vehicle_segment import AgreementVehicleSegment
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services.telegram_bot_service import TelegramBotService

CHAT = 9700


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


def buttons(service) -> list[str]:
    """Labels of every button offered, newest call last."""
    labels = []
    for call in service._send_message.await_args_list:
        markup = call.kwargs.get("reply_markup") or {}
        for row in markup.get("keyboard", []):
            for b in row:
                labels.append(b.get("text", ""))
    return labels


def make_car(db: Session, vendor: Vendor, plate: str, rate="1100.00", weekly=None):
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate,
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal(rate),
        weekly_rate=Decimal(weekly) if weekly else None,
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def car(db: Session, vendor: Vendor) -> Vehicle:
    return make_car(db, vendor, "DF-0001", weekly="6500.00")


@pytest.fixture
def linked(db: Session, service) -> Customer:
    c = Customer(
        first_name="Dates",
        last_name="First",
        phone_primary="+251955111222",
        id_type="national_id",
        id_number="DF-CUST-1",
        license_number="DL-DF-1",
        license_expiry=datetime.now() + timedelta(days=900),
        is_active=True,
    )
    db.add(c)
    db.commit()
    user = CustomerUser(
        customer_id=c.id,
        email="datesfirst@example.com",
        hashed_password=hash_password("pass12345"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramCustomerLink(
            customer_user_id=user.id, telegram_user_id=9701, chat_id=CHAT, is_active=True
        )
    )
    db.commit()
    return c


def send(service, body: str) -> None:
    asyncio.run(
        service._process_update({
            "message": {
                "chat": {"id": CHAT},
                "from": {"id": 9701, "username": "df"},
                "text": body,
            }
        })
    )


class TestTheFlowAsksWhenBeforeWhat:
    def test_book_asks_for_dates_not_a_car(self, db: Session, service, linked, car):
        send(service, "/book")

        out = text(service).lower()
        assert "when" in out or "pickup" in out, out
        assert "reply with the number to select" not in out, (
            "still asking for a car before knowing the dates"
        )

    def test_the_common_spans_are_buttons(self, db: Session, service, linked, car):
        send(service, "/book")

        labels = " ".join(buttons(service)).lower()
        assert "today" in labels or "tomorrow" in labels, labels

    def test_a_preset_avoids_typing_a_date(self, db: Session, service, linked, car):
        send(service, "/book")
        send(service, "Tomorrow")

        out = text(service).lower()
        assert "how long" in out or "day" in out, out

    def test_a_typed_date_still_works(self, db: Session, service, linked, car):
        """Buttons are an offer, not a replacement."""
        send(service, "/book")
        pickup = datetime.now() + timedelta(days=20)
        send(service, pickup.strftime("%d/%m/%Y"))

        assert "invalid date" not in text(service).lower(), text(service)

    def test_a_past_date_is_refused(self, db: Session, service, linked, car):
        send(service, "/book")
        send(service, (datetime.now() - timedelta(days=3)).strftime("%d/%m/%Y"))

        assert "future" in text(service).lower()


class TestOnlyBookableCarsAreOffered:
    def test_a_car_booked_for_those_dates_is_not_listed(
        self, db: Session, service, linked, car, vendor
    ):
        """The whole point: never offer what cannot be had."""
        free = make_car(db, vendor, "DF-FREE")
        free_id, blocked_id = free.id, car.id

        pickup = datetime.now().replace(microsecond=0) + timedelta(days=20)
        taken = Agreement(
            agreement_number="DF-BLOCK-1",
            agreement_type=AgreementType.CUSTOMER_VEHICLE,
            status=AgreementStatus.PENDING_PAYMENT,
            customer_id=linked.id,
            pickup_datetime=pickup - timedelta(days=1),
            expected_return_datetime=pickup + timedelta(days=5),
            agreed_daily_rate=car.daily_rate,
            deposit_amount=Decimal("0"),
        )
        db.add(taken)
        db.flush()
        db.add(
            AgreementVehicleSegment(
                agreement_id=taken.id,
                vehicle_id=car.id,
                start_datetime=taken.pickup_datetime,
                end_datetime=taken.expected_return_datetime,
                daily_rate=car.daily_rate,
            )
        )
        db.commit()

        send(service, "/book")
        send(service, pickup.strftime("%d/%m/%Y"))
        send(service, "3 days")

        # Assert on the offered ids, not the rendered text: both cars are
        # Toyota Yaris, so counting names proves nothing.
        state = service._booking_states[CHAT]
        offered = {v["id"] for v in state.data["vehicles"]}
        assert free_id in offered, offered
        assert blocked_id not in offered, "offered a car already booked for those dates"

    def test_nothing_free_says_so_rather_than_listing_nothing(
        self, db: Session, service, linked, car
    ):
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=20)
        taken = Agreement(
            agreement_number="DF-BLOCK-2",
            agreement_type=AgreementType.CUSTOMER_VEHICLE,
            status=AgreementStatus.PENDING_PAYMENT,
            customer_id=linked.id,
            pickup_datetime=pickup - timedelta(days=1),
            expected_return_datetime=pickup + timedelta(days=10),
            agreed_daily_rate=car.daily_rate,
            deposit_amount=Decimal("0"),
        )
        db.add(taken)
        db.flush()
        db.add(
            AgreementVehicleSegment(
                agreement_id=taken.id,
                vehicle_id=car.id,
                start_datetime=taken.pickup_datetime,
                end_datetime=taken.expected_return_datetime,
                daily_rate=car.daily_rate,
            )
        )
        db.commit()

        send(service, "/book")
        send(service, pickup.strftime("%d/%m/%Y"))
        send(service, "3 days")

        out = text(service).lower()
        assert "no cars" in out or "nothing available" in out, out


class TestThePriceIsShownPerCar:
    def test_each_car_carries_its_total_for_the_chosen_dates(
        self, db: Session, service, linked, car
    ):
        """A price for the actual rental, not a daily rate to multiply."""
        send(service, "/book")
        send(service, (datetime.now() + timedelta(days=20)).strftime("%d/%m/%Y"))
        send(service, "1 week")

        out = text(service)
        assert "6,500" in out, f"weekly tier not applied on the card: {out}"


class TestTheBookingStillCompletes:
    def test_end_to_end(self, db: Session, service, linked, car):
        send(service, "/book")
        send(service, (datetime.now() + timedelta(days=20)).strftime("%d/%m/%Y"))
        send(service, "3 days")
        send(service, "1")
        send(service, "skip")
        send(service, "skip")
        send(service, "CONFIRM")

        created = db.query(Agreement).order_by(Agreement.id.desc()).first()
        assert created is not None, text(service)
        assert created.status == AgreementStatus.BOOKING_REQUESTED
        assert created.agreement_number in text(service)
