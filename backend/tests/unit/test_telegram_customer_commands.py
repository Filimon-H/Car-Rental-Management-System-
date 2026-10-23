"""Every customer-facing bot command, end to end.

The four customer commands (/book, /mybookings, /extend, /cancelbook) had
no coverage at all, and the booking flow turns out to carry its own copies
of bugs already fixed on the web side: it prices at the flat daily rate and
never checks document expiry.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.security import hash_password
from src.models.agreement import Agreement, AgreementStatus
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service
from src.services.telegram_bot_service import TelegramBotService

CHAT = 950


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
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Bot",
        last_name="Customer",
        phone_primary="+251955000111",
        id_type="national_id",
        id_number="BOTID-7788",
        license_number="DL-55551",
        license_expiry=datetime.now() + timedelta(days=900),
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def linked(db: Session, service, customer) -> TelegramBotService:
    user = CustomerUser(
        customer_id=customer.id,
        email="botcustomer@example.com",
        hashed_password=hash_password("pass12345"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramCustomerLink(
            customer_user_id=user.id, telegram_user_id=7777, chat_id=CHAT, is_active=True
        )
    )
    db.commit()
    return service


@pytest.fixture
def tiered_car(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="BOT-0001",
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


def send(service, body: str) -> None:
    asyncio.run(
        service._process_update({
            "message": {
                "chat": {"id": CHAT},
                "from": {"id": 7777, "username": "botcust"},
                "text": body,
            }
        })
    )


class TestBookCommand:
    def test_it_lists_available_cars(self, db: Session, linked, tiered_car):
        """Cars come after the dates, priced for the rental asked for."""
        send(linked, "/book")
        send(linked, (datetime.now() + timedelta(days=11)).strftime("%d/%m/%Y"))
        send(linked, "3 days")

        out = text(linked)
        assert "Yaris" in out, out
        # A total for the chosen dates, not a rate to multiply.
        assert "3,300" in out, out

    def test_it_says_so_when_nothing_is_available(self, db: Session, linked, tiered_car):
        """Availability is known only once the dates are."""
        tiered_car.status = VehicleStatus.RENTED
        db.commit()

        send(linked, "/book")
        send(linked, (datetime.now() + timedelta(days=11)).strftime("%d/%m/%Y"))
        send(linked, "3 days")

        assert "no cars are free" in text(linked).lower(), text(linked)

    def test_a_long_fleet_does_not_overflow_telegram(
        self, db: Session, linked, vendor: Vendor
    ):
        """Staff lists were capped; this one still prints every car."""
        for i in range(60):
            db.add(
                Vehicle(
                    vendor_id=vendor.id,
                    plate_number=f"FLEET-{i:04d}",
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

        send(linked, "/book")
        for call in linked._send_message.await_args_list:
            assert len(str(call.args[1])) <= 4096, len(str(call.args[1]))

    def test_the_quote_uses_tiered_pricing(self, db: Session, linked, tiered_car):
        """The web booking page applies the weekly tier; this did not."""
        pickup = datetime.now() + timedelta(days=11)
        send(linked, "/book")
        send(linked, pickup.strftime("%d/%m/%Y"))
        send(linked, "7 days")

        out = text(linked)
        assert "7,700" not in out, f"quoted the flat daily rate: {out}"
        assert "6,500" in out, out

    def test_it_does_not_echo_the_full_id_number(
        self, db: Session, linked, tiered_car, customer
    ):
        """Same leak as /customer, in the customer flow."""
        secret = customer.id_number  # read before the handler detaches it
        send(linked, "/book")
        send(linked, (datetime.now() + timedelta(days=11)).strftime("%d/%m/%Y"))
        send(linked, "3 days")
        send(linked, "1")

        assert secret not in text(linked), text(linked)

    def test_an_expired_licence_is_refused(
        self, db: Session, linked, tiered_car, customer
    ):
        """The web flow blocks this; the bot booked anyway."""
        customer_id = customer.id
        customer.license_expiry = datetime.now() - timedelta(days=30)
        db.commit()

        pickup = datetime.now() + timedelta(days=11)
        send(linked, "/book")
        send(linked, pickup.strftime("%d/%m/%Y"))
        send(linked, "3 days")
        send(linked, "1")
        send(linked, "skip")
        send(linked, "skip")
        send(linked, "CONFIRM")

        created = (
            db.query(Agreement)
            .filter(Agreement.customer_id == customer_id)
            .count()
        )
        assert created == 0, "booked on an expired licence"
        assert "licence" in text(linked).lower() or "license" in text(linked).lower()

    def test_a_past_pickup_is_refused(self, db: Session, linked, tiered_car):
        send(linked, "/book")
        send(linked, (datetime.now() - timedelta(days=5)).strftime("%d/%m/%Y"))

        assert "future" in text(linked).lower()

    def test_a_bad_car_number_is_refused(self, db: Session, linked, tiered_car):
        send(linked, "/book")
        send(linked, (datetime.now() + timedelta(days=11)).strftime("%d/%m/%Y"))
        send(linked, "3 days")
        send(linked, "99")
        assert "between 1 and" in text(linked), text(linked)

    def test_cancel_aborts_the_flow(self, db: Session, linked, tiered_car):
        send(linked, "/book")
        send(linked, "/cancel")
        assert CHAT not in linked._booking_states


class TestMyBookingsCommand:
    def test_it_lists_a_booking(self, db: Session, linked, customer, tiered_car):
        pickup = datetime.now() + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_car.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=tiered_car.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        send(linked, "/mybookings")
        assert agreement.agreement_number in text(linked)

    def test_no_bookings_still_answers(self, db: Session, linked):
        send(linked, "/mybookings")
        assert linked._send_message.await_count >= 1


class TestCancelBookCommand:
    def test_it_cancels_by_agreement_number(
        self, db: Session, linked, customer, tiered_car
    ):
        pickup = datetime.now() + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_car.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=tiered_car.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        number = agreement.agreement_number
        send(linked, f"/cancelbook {number}")

        after = db.query(Agreement).filter(Agreement.agreement_number == number).one()
        assert after.status == AgreementStatus.CANCELLED, text(linked)

    def test_another_customers_booking_is_refused(
        self, db: Session, linked, tiered_car
    ):
        """Ownership must be enforced on the bot as it is on the API."""
        other = Customer(
            first_name="Someone",
            last_name="Else",
            phone_primary="+251955000999",
            id_type="national_id",
            id_number="OTHER-01",
            is_active=True,
        )
        db.add(other)
        db.commit()
        pickup = datetime.now() + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=other.id,
            vehicle_id=tiered_car.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=tiered_car.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        number = agreement.agreement_number
        send(linked, f"/cancelbook {number}")

        after = db.query(Agreement).filter(Agreement.agreement_number == number).one()
        assert after.status == AgreementStatus.BOOKING_REQUESTED, (
            "cancelled another customer's booking"
        )

    def test_a_missing_argument_is_handled(self, db: Session, linked):
        send(linked, "/cancelbook")
        assert linked._send_message.await_count >= 1


class TestExtendCommand:
    def test_it_offers_an_active_rental(self, db: Session, linked, customer, tiered_car):
        pickup = datetime.now() + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_car.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=tiered_car.daily_rate,
        )
        agreement.status = AgreementStatus.ACTIVE
        db.commit()

        send(linked, "/extend")
        assert linked._send_message.await_count >= 1

    def test_nothing_to_extend_still_answers(self, db: Session, linked):
        send(linked, "/extend")
        assert linked._send_message.await_count >= 1


class TestUniversalCommands:
    def test_start_answers_a_linked_customer(self, db: Session, linked):
        send(linked, "/start")
        assert linked._send_message.await_count >= 1

    def test_help_answers(self, db: Session, linked):
        send(linked, "/help")
        assert linked._send_message.await_count >= 1

    def test_an_unknown_command_is_handled(self, db: Session, linked):
        send(linked, "/foobar")
        out = text(linked)
        assert out.strip() != "", "no reply to an unknown command"

    def test_a_staff_command_from_a_customer_is_refused(
        self, db: Session, linked, customer
    ):
        """A linked customer must not reach staff tooling."""
        send(linked, "/overdue")
        out = text(linked)
        assert "overdue agreements:" not in out.lower(), out
