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
from src.models.customer import Customer  # noqa: E402
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
start, end = noon + timedelta(days=30), noon + timedelta(days=37)
hold = Agreement(agreement_number="E2E-HOLD-1", agreement_type=AgreementType.CUSTOMER_VEHICLE,
                 status=AgreementStatus.PENDING_PAYMENT, customer_id=owner.id, pickup_datetime=start,
                 expected_return_datetime=end, agreed_daily_rate=busy.daily_rate, deposit_amount=Decimal("0"))
db.add(hold)
db.flush()
db.add(AgreementVehicleSegment(agreement_id=hold.id, vehicle_id=busy.id, start_datetime=start,
                               end_datetime=end, daily_rate=busy.daily_rate))
db.commit()
free_id, busy_id = free.id, busy.id
db.close()
print(f"seeded: vehicles {free_id} (free) and {busy_id} (busy days 30-37)")
