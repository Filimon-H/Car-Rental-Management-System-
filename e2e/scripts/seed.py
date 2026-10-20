"""Seed the throwaway end-to-end database.

Run by start-backend.sh against a fresh file built by the real migrations.
Never point this at a real database: it creates fixed logins.
"""
import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

url = os.environ.get("DATABASE_URL", "")
if "e2e" not in url:
    sys.exit(f"refusing to seed a database that is not the e2e one: {url!r}")

from src.core.db import SessionLocal  # noqa: E402
from src.models.agreement import Agreement, AgreementStatus, AgreementType  # noqa: E402
from src.models.agreement_vehicle_segment import AgreementVehicleSegment  # noqa: E402
from src.core.security import hash_password  # noqa: E402
from src.models.customer import Customer  # noqa: E402
from src.models.customer_user import CustomerUser  # noqa: E402
from src.models.ledger_entry import LedgerEntryType, PaymentMethod  # noqa: E402
from src.services import ledger_service  # noqa: E402
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType  # noqa: E402
from src.models.vendor import Vendor  # noqa: E402

import seed_users  # noqa: E402

db = SessionLocal()

# Staff: passwords come from SEED_PASSWORD_<USERNAME>, set by the runner.
seed_users.seed(db)

vendor = Vendor(vendor_type="company", company_name="E2E Fleet PLC", phone_primary="0911999999", is_active=True)
db.add(vendor)
db.commit()


def car(plate, model, rate, weekly=None, status=VehicleStatus.AVAILABLE):
    v = Vehicle(vendor_id=vendor.id, plate_number=plate, plate_code="3", plate_city="AA", make="Toyota",
                model=model, year=2024, color="White", vehicle_type=VehicleType.SEDAN, service_type="business",
                seats=5, transmission="automatic", daily_rate=Decimal(rate),
                weekly_rate=Decimal(weekly) if weekly else None, status=status, is_active=True)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


free = car("E2E-YARIS", "Yaris", "1100.00", weekly="6500.00")
busy = car("E2E-COROLLA", "Corolla", "1500.00", status=VehicleStatus.RESERVED)

# A confirmed booking that makes the Corolla busy 30-37 days from now, so
# the date search has to answer differently for different windows.
owner = Customer(first_name="Seed", last_name="Holder", phone_primary="+251911000001",
                 id_type="national_id", id_number="E2E-SEED-1", is_active=True)
db.add(owner)
db.commit()
noon = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)


def hold(number, vehicle, first_day, last_day):
    """A confirmed booking that keeps `vehicle` busy between the two days."""
    start, end = noon + timedelta(days=first_day), noon + timedelta(days=last_day)
    a = Agreement(agreement_number=number, agreement_type=AgreementType.CUSTOMER_VEHICLE,
                  status=AgreementStatus.PENDING_PAYMENT, customer_id=owner.id, pickup_datetime=start,
                  expected_return_datetime=end, agreed_daily_rate=vehicle.daily_rate, deposit_amount=Decimal("0"))
    db.add(a)
    db.flush()
    db.add(AgreementVehicleSegment(agreement_id=a.id, vehicle_id=vehicle.id, start_datetime=start,
                                   end_datetime=end, daily_rate=vehicle.daily_rate))
    db.commit()


# The Corolla is busy 30-37 days out, so the date search has to answer
# differently for different windows; 60-65 days out every car is taken.
hold("E2E-HOLD-1", busy, 30, 37)
hold("E2E-FULL-1", free, 60, 65)
hold("E2E-FULL-2", busy, 60, 65)

# A rental already out: picked up 3 days ago, due back tomorrow, 6,000
# charged and 1,000 paid, for a customer who can sign in. The return tests
# bring it back with money still owed.
renter = Customer(first_name="Hiwot", last_name="Out", phone_primary="+251911000002",
                  email="out-e2e@example.com", id_type="national_id", id_number="E2E-OUT-1", is_active=True)
db.add(renter)
db.commit()
db.add(CustomerUser(customer_id=renter.id, email=renter.email,
                    hashed_password=hash_password(os.environ.get("E2E_CUSTOMER_PASSWORD", "e2e-customer-pass")),
                    token_version=0, is_active=True))
out_start, out_end = noon - timedelta(days=3), noon + timedelta(days=1)
out = Agreement(agreement_number="E2E-OUT-1", agreement_type=AgreementType.CUSTOMER_VEHICLE,
                status=AgreementStatus.ACTIVE, customer_id=renter.id, pickup_datetime=out_start,
                expected_return_datetime=out_end, agreed_daily_rate=busy.daily_rate, deposit_amount=Decimal("0"))
db.add(out)
db.flush()
db.add(AgreementVehicleSegment(agreement_id=out.id, vehicle_id=busy.id, start_datetime=out_start,
                               end_datetime=out_end, daily_rate=busy.daily_rate))
busy.status = VehicleStatus.RENTED
db.commit()
ledger_service.post_charge(db, out.id, Decimal("6000.00"), "Rental: 4 days x ETB 1,500.00",
                           entry_type=LedgerEntryType.CHARGE)
ledger_service.post_payment(db, out.id, Decimal("1000.00"), PaymentMethod.CASH)

free_id, busy_id = free.id, busy.id
db.close()
print(f"seeded: vehicles {free_id} (free) and {busy_id} (busy days 30-37); both busy days 60-65; E2E-OUT-1 rented out")
