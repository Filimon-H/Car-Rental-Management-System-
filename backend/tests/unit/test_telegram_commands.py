"""Do the bot's staff commands actually answer, and answer correctly?

The existing suite covers broadcast routing and reconnect backoff but not a
single command handler, so /due_today, /overdue, /customer and /car — the
ones staff rely on — had no coverage at all. These drive the real handlers
with the send captured.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Permission, Role
from src.core.security import hash_password
from src.models.customer import Customer
from src.models.staff_user import StaffUser
from src.models.vehicle import Vehicle
from src.models.vendor import Vendor
from src.services import agreement_service
from src.services.telegram_bot_service import TelegramBotService


def _staff(db: Session, username: str, role: Role) -> StaffUser:
    user = StaffUser(
        username=username,
        email=f"{username}@example.com",
        full_name=f"{username} user",
        hashed_password=hash_password("testpass123"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def service(monkeypatch):
    svc = TelegramBotService()
    monkeypatch.setattr(type(svc), "enabled", property(lambda self: True))
    svc._send_message = AsyncMock()
    return svc


def sent_text(service) -> str:
    """Everything the handler sent, joined."""
    return "\n".join(str(call.args[1]) for call in service._send_message.await_args_list)


@pytest.fixture
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Abebe",
        last_name="Bekele",
        phone_primary="+251911223344",
        id_type="national_id",
        id_number="TG-NID-1",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def vehicle(db: Session, vendor: Vendor) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="TG-4242",
        plate_code="3",
        make="Toyota",
        model="Corolla",
        year=2022,
        color="White",
        vehicle_type="standard",
        service_type="business",
        car_condition="good",
        seats=5,
        transmission="manual",
        fuel_type="petrol",
        daily_rate=Decimal("1500.00"),
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


class TestHelpIsRoleAware:
    """_handle_help resolves the link itself, so it needs a real one."""

    def test_an_admin_sees_staff_commands(self, db: Session, service, monkeypatch):
        from src.models.telegram import TelegramStaffLink
        from src.services import telegram_bot_service as mod

        monkeypatch.setattr(mod, "SessionLocal", lambda: db)
        admin = _staff(db, "tg_admin_help", Role.ADMIN)
        db.add(
            TelegramStaffLink(
                staff_user_id=admin.id, telegram_user_id=900, chat_id=900, is_active=True
            )
        )
        db.commit()

        asyncio.run(service._handle_help(900))

        text = sent_text(service)
        assert "/due_today" in text
        assert "/overdue" in text
        assert "/customer" in text

    def test_an_inspector_is_not_offered_customer_lookup(
        self, db: Session, service, monkeypatch
    ):
        """Help must not advertise a command the role cannot run."""
        from src.models.telegram import TelegramStaffLink
        from src.services import telegram_bot_service as mod

        monkeypatch.setattr(mod, "SessionLocal", lambda: db)
        inspector = _staff(db, "tg_insp_help", Role.INSPECTOR)
        db.add(
            TelegramStaffLink(
                staff_user_id=inspector.id, telegram_user_id=901, chat_id=901, is_active=True
            )
        )
        db.commit()

        asyncio.run(service._handle_help(901))

        text = sent_text(service)
        assert "/customer" not in text
        assert "/help" in text, "an unlinked-capability role still gets basic help"


class TestCustomerLookup:
    def test_it_finds_a_customer_by_phone(self, db: Session, service, customer):
        admin = _staff(db, "tg_admin_cust", Role.ADMIN)
        asyncio.run(
            service._handle_customer_lookup(db, admin, 902, "+251911223344")
        )

        text = sent_text(service)
        assert "Abebe" in text
        assert "Bekele" in text

    def test_an_unknown_phone_reports_not_found(self, db: Session, service, customer):
        admin = _staff(db, "tg_admin_cust2", Role.ADMIN)
        asyncio.run(service._handle_customer_lookup(db, admin, 903, "+251900000000"))

        assert "Abebe" not in sent_text(service)

    def test_a_role_without_permission_is_refused(self, db: Session, service, customer):
        """The handler must gate, not just the help text."""
        from src.core.rbac import has_permission

        inspector = _staff(db, "tg_insp_cust", Role.INSPECTOR)
        assert not has_permission(inspector.role, Permission.VIEW_CUSTOMERS)

        asyncio.run(
            service._handle_customer_lookup(db, inspector, 904, "+251911223344")
        )
        assert "Abebe" not in sent_text(service)


class TestVehicleLookup:
    def test_it_finds_a_vehicle_by_plate(self, db: Session, service, vehicle):
        fleet = _staff(db, "tg_fleet_car", Role.FLEET)
        asyncio.run(service._handle_vehicle_lookup(db, fleet, 905, "TG-4242"))

        text = sent_text(service)
        assert "TG-4242" in text
        assert "Corolla" in text


class TestDueTodayAndOverdue:
    def test_due_today_lists_a_rental_due_now(
        self, db: Session, service, customer, vehicle
    ):
        pickup = datetime.now(timezone.utc) + timedelta(days=1)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=2),
            daily_rate=Decimal("1500.00"),
        )
        # Bring the return into today and make it live.
        now = datetime.now()
        agreement.expected_return_datetime = now.replace(hour=23, minute=0, second=0)
        agreement.pickup_datetime = now - timedelta(days=2)
        from src.models.agreement import AgreementStatus

        agreement.status = AgreementStatus.ACTIVE
        db.commit()

        admin = _staff(db, "tg_admin_due", Role.ADMIN)
        asyncio.run(service._handle_due_today(db, admin, 906))

        assert agreement.agreement_number in sent_text(service)

    def test_overdue_lists_an_overdue_rental(
        self, db: Session, service, customer, vehicle
    ):
        from src.models.agreement import AgreementStatus

        pickup = datetime.now(timezone.utc) + timedelta(days=1)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=2),
            daily_rate=Decimal("1500.00"),
        )
        now = datetime.now()
        agreement.pickup_datetime = now - timedelta(days=10)
        agreement.expected_return_datetime = now - timedelta(days=3)
        agreement.status = AgreementStatus.OVERDUE
        db.commit()

        admin = _staff(db, "tg_admin_ovd", Role.ADMIN)
        asyncio.run(service._handle_overdue(db, admin, 907))

        assert agreement.agreement_number in sent_text(service)

    def test_an_empty_list_still_answers(self, db: Session, service):
        """Silence would look like the bot is broken."""
        admin = _staff(db, "tg_admin_empty", Role.ADMIN)
        asyncio.run(service._handle_due_today(db, admin, 908))

        assert service._send_message.await_count >= 1
