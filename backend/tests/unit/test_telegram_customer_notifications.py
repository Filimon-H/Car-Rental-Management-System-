"""What the bot tells a customer without being opened.

Reaching a customer who is not looking at the site is the one thing a bot
does that a website cannot. Return reminders and overdue alerts already
existed; the two moments a customer most wants to hear about — their
request being approved, and a payment landing — did not.
"""
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.security import hash_password
from src.models.agreement import Agreement, AgreementStatus
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.ledger_entry import LedgerEntryType, PaymentMethod
from src.models.telegram import TelegramCustomerLink
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service, ledger_service
from src.services.telegram_bot_service import TelegramBotService

CHAT = 9400


@pytest.fixture
def service(monkeypatch, db: Session):
    from src.services import telegram_bot_service as mod

    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    monkeypatch.setattr(mod, "SessionLocal", lambda: db)
    svc._send_message = AsyncMock()
    # The module-level singleton is what services reach for.
    monkeypatch.setattr(mod, "telegram_bot_service", svc)
    return svc


def text(service) -> str:
    return "\n".join(str(c.args[1]) for c in service._send_message.await_args_list)


@pytest.fixture
def car(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="NOT-0001",
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
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Notify",
        last_name="Me",
        phone_primary="+251944000111",
        id_type="national_id",
        id_number="NOT-CUST-1",
        license_number="DL-NOT-1",
        license_expiry=datetime.now() + timedelta(days=900),
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def linked(db: Session, customer) -> Customer:
    user = CustomerUser(
        customer_id=customer.id,
        email="notify@example.com",
        hashed_password=hash_password("pass12345"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.add(
        TelegramCustomerLink(
            customer_user_id=user.id, telegram_user_id=9401, chat_id=CHAT, is_active=True
        )
    )
    db.commit()
    return customer


@pytest.fixture
def requested(db: Session, customer, car) -> Agreement:
    """A booking request as the public API creates one.

    create_standard_agreement is the staff path and posts a rental charge
    immediately; the customer path builds the agreement with no charge
    until staff approve it. Using the staff helper here would leave two
    charges on the ledger and misreport every balance in these tests.
    """
    from src.models.agreement import AgreementType
    from src.models.agreement_vehicle_segment import AgreementVehicleSegment

    pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
    ret = pickup + timedelta(days=7)
    a = Agreement(
        agreement_number=agreement_service.generate_agreement_number(db),
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=AgreementStatus.BOOKING_REQUESTED,
        customer_id=customer.id,
        pickup_datetime=pickup,
        expected_return_datetime=ret,
        agreed_daily_rate=car.daily_rate,
        deposit_amount=Decimal("0"),
    )
    db.add(a)
    db.flush()
    db.add(
        AgreementVehicleSegment(
            agreement_id=a.id,
            vehicle_id=car.id,
            start_datetime=pickup,
            end_datetime=ret,
            daily_rate=car.daily_rate,
        )
    )
    db.commit()
    db.refresh(a)
    return a


class TestApprovalReachesTheCustomer:
    def test_they_are_told_when_staff_approve(
        self, db: Session, service, linked, requested
    ):
        """Until now a customer had to keep opening /mybookings to find out."""
        agreement_service.approve_booking_request(db, requested.id)

        out = text(service)
        assert requested.agreement_number in out, out
        assert "confirm" in out.lower(), out

    def test_the_message_carries_what_they_must_pay(
        self, db: Session, service, linked, requested
    ):
        agreement_service.approve_booking_request(db, requested.id)

        out = text(service)
        # The tiered figure, not 7 x 1,100.
        assert "6,500" in out, out

    def test_an_unlinked_customer_is_simply_skipped(
        self, db: Session, service, customer, requested
    ):
        """No Telegram link is not an error."""
        agreement_service.approve_booking_request(db, requested.id)
        assert service._send_message.await_count == 0

    def test_approval_still_succeeds_if_telegram_is_down(
        self, db: Session, service, linked, requested
    ):
        """A notification must never roll back the business action."""
        service._send_message.side_effect = RuntimeError("telegram unreachable")

        approved = agreement_service.approve_booking_request(db, requested.id)

        assert approved.status == AgreementStatus.PENDING_PAYMENT


class TestPaymentsReachTheCustomer:
    def test_a_payment_is_acknowledged_with_the_balance(
        self, db: Session, service, linked, requested
    ):
        agreement_service.approve_booking_request(db, requested.id)
        service._send_message.reset_mock()

        ledger_service.post_payment(
            db=db,
            agreement_id=requested.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.CASH,
            description="Part payment",
        )

        out = text(service)
        assert "2,000" in out, out
        assert "4,500" in out, f"balance not shown: {out}"

    def test_settling_in_full_says_so(self, db: Session, service, linked, requested):
        agreement_service.approve_booking_request(db, requested.id)
        service._send_message.reset_mock()

        ledger_service.post_payment(
            db=db,
            agreement_id=requested.id,
            amount=Decimal("6500.00"),
            payment_method=PaymentMethod.CASH,
            description="Full payment",
        )

        assert "paid in full" in text(service).lower(), text(service)

    def test_a_payment_still_posts_if_telegram_is_down(
        self, db: Session, service, linked, requested
    ):
        agreement_service.approve_booking_request(db, requested.id)
        service._send_message.side_effect = RuntimeError("telegram unreachable")

        entry = ledger_service.post_payment(
            db=db,
            agreement_id=requested.id,
            amount=Decimal("1000.00"),
            payment_method=PaymentMethod.CASH,
            description="Payment",
        )

        assert entry.id is not None
        assert ledger_service.get_total_payments(db, requested.id) == Decimal("1000.00")


class TestReturnRemindersUseBusinessTime:
    """The reminder compared wall-clock values against UTC now.

    Business dates carry no offset, so treating them as UTC shifted every
    comparison by three hours — enough to send a "due in 0 days" the
    evening before, or mark a rental overdue three hours early.
    """

    def _active(self, db, customer, car, due_in_hours: float) -> Agreement:
        from src.models.agreement import AgreementType
        from src.models.agreement_vehicle_segment import AgreementVehicleSegment

        now = datetime.now().replace(microsecond=0)
        a = Agreement(
            agreement_number=agreement_service.generate_agreement_number(db),
            agreement_type=AgreementType.CUSTOMER_VEHICLE,
            status=AgreementStatus.ACTIVE,
            customer_id=customer.id,
            pickup_datetime=now - timedelta(days=3),
            expected_return_datetime=now + timedelta(hours=due_in_hours),
            agreed_daily_rate=car.daily_rate,
            deposit_amount=Decimal("0"),
        )
        db.add(a)
        db.flush()
        db.add(
            AgreementVehicleSegment(
                agreement_id=a.id,
                vehicle_id=car.id,
                start_datetime=a.pickup_datetime,
                end_datetime=a.expected_return_datetime,
                daily_rate=car.daily_rate,
            )
        )
        db.commit()
        db.refresh(a)
        return a

    def test_a_rental_due_in_two_hours_is_not_called_overdue(
        self, db: Session, service, linked, customer, car
    ):
        """Three hours of drift turns "due soon" into "overdue"."""
        agreement_id = self._active(db, customer, car, due_in_hours=2).id

        asyncio.run(service._send_return_reminders())

        out = text(service)
        assert "OVERDUE" not in out, f"called a rental overdue two hours early: {out}"
        after = db.query(Agreement).filter(Agreement.id == agreement_id).one()
        assert after.status == AgreementStatus.ACTIVE

    def test_a_genuinely_late_rental_is_still_flagged(
        self, db: Session, service, linked, customer, car
    ):
        agreement_id = self._active(db, customer, car, due_in_hours=-30).id

        asyncio.run(service._send_return_reminders())

        assert "OVERDUE" in text(service)
        after = db.query(Agreement).filter(Agreement.id == agreement_id).one()
        assert after.status == AgreementStatus.OVERDUE

    def test_a_reminder_is_sent_once_per_day_remaining(
        self, db: Session, service, linked, customer, car
    ):
        self._active(db, customer, car, due_in_hours=48)

        asyncio.run(service._send_return_reminders())
        first = service._send_message.await_count
        asyncio.run(service._send_return_reminders())

        assert service._send_message.await_count == first, (
            "the same reminder was sent twice"
        )
