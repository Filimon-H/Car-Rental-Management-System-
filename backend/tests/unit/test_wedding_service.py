"""Unit tests for wedding agreement service — multi-vehicle rental logic."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.customer import Customer
from src.models.vendor import Vendor
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.services import ledger_service, wedding_agreement_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def customer(db: Session) -> Customer:
    c = Customer(
        first_name="Hana",
        last_name="Solomon",
        phone_primary="0922000001",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def inactive_customer(db: Session) -> Customer:
    c = Customer(
        first_name="Old",
        last_name="Bride",
        phone_primary="0922000002",
        is_active=False,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_vehicle(
    db: Session,
    vendor: Vendor,
    plate: str,
    rate: Decimal = Decimal("2000.00"),
) -> Vehicle:
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number=plate,
        plate_code="01",
        plate_city="AA",
        make="Mercedes",
        model="E-Class",
        year=2023,
        color="Black",
        vehicle_type=VehicleType.SEDAN,
        service_type="wedding",
        daily_rate=rate,
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@pytest.fixture
def v1(db: Session, vendor: Vendor) -> Vehicle:
    return _make_vehicle(db, vendor, "WED-001", Decimal("2000.00"))


@pytest.fixture
def v2(db: Session, vendor: Vendor) -> Vehicle:
    return _make_vehicle(db, vendor, "WED-002", Decimal("1800.00"))


@pytest.fixture
def v3(db: Session, vendor: Vendor) -> Vehicle:
    return _make_vehicle(db, vendor, "WED-003", Decimal("1600.00"))


def future(days: float = 1) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def past(days: float = 1) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _cfg(vehicle: Vehicle, start: datetime, end: datetime, rate: Decimal | None = None) -> dict:
    """Build a vehicle_config dict for wedding creation."""
    return {
        "vehicle_id": vehicle.id,
        "daily_rate": rate or vehicle.daily_rate,
        "start": start,
        "end": end,
    }


# ---------------------------------------------------------------------------
# create_wedding_agreement
# ---------------------------------------------------------------------------

class TestCreateWeddingAgreement:

    def test_creates_with_pending_payment_status(self, db, customer, v1):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, future(1), future(3))],
            event_date=future(1),
        )
        assert ag.status == AgreementStatus.PENDING_PAYMENT

    def test_agreement_type_is_wedding(self, db, customer, v1):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, future(1), future(3))],
            event_date=future(1),
        )
        assert ag.agreement_type == AgreementType.WEDDING

    def test_agreement_number_starts_with_wed(self, db, customer, v1):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, future(1), future(3))],
            event_date=future(1),
        )
        assert ag.agreement_number.startswith("WED-")

    def test_single_vehicle_charge_posted(self, db, customer, v1):
        """2-day rental @ 2000/day → 4000 charge."""
        start = future(1)
        end = start + timedelta(days=2)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, start, end, Decimal("2000.00"))],
            event_date=start,
        )
        balance = ledger_service.get_agreement_balance(db, ag.id)
        assert balance == Decimal("4000.00")

    def test_multiple_vehicles_total_charge(self, db, customer, v1, v2):
        """v1: 2 days @ 2000 = 4000; v2: 1 day @ 1800 = 1800; total = 5800."""
        start1 = future(1)
        end1 = start1 + timedelta(days=2)
        start2 = future(1)
        end2 = start2 + timedelta(days=1)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[
                _cfg(v1, start1, end1, Decimal("2000.00")),
                _cfg(v2, start2, end2, Decimal("1800.00")),
            ],
            event_date=start1,
        )
        balance = ledger_service.get_agreement_balance(db, ag.id)
        assert balance == Decimal("5800.00")

    def test_overall_period_spans_all_vehicles(self, db, customer, v1, v2):
        """Agreement pickup = earliest start, return = latest end."""
        start1 = future(1)
        end1 = start1 + timedelta(days=1)
        start2 = future(2)
        end2 = start2 + timedelta(days=2)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[
                _cfg(v1, start1, end1),
                _cfg(v2, start2, end2),
            ],
            event_date=start1,
        )
        assert ag.pickup_datetime.date() == start1.date()
        assert ag.expected_return_datetime.date() == end2.date()

    def test_creates_vehicle_segments(self, db, customer, v1, v2):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[
                _cfg(v1, future(1), future(3)),
                _cfg(v2, future(1), future(2)),
            ],
            event_date=future(1),
        )
        assert len(ag.vehicle_segments) == 2
        vehicle_ids = {s.vehicle_id for s in ag.vehicle_segments}
        assert v1.id in vehicle_ids
        assert v2.id in vehicle_ids

    def test_future_vehicles_set_to_reserved(self, db, customer, v1):
        """Vehicles with future start are set to RESERVED, not RENTED."""
        wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, future(2), future(4))],
            event_date=future(2),
        )
        db.refresh(v1)
        assert v1.status == VehicleStatus.RESERVED

    def test_partial_day_charge_rounds_up(self, db, customer, v1):
        """25-hour rental → 2 days billed."""
        start = future(1)
        end = start + timedelta(hours=25)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, start, end, Decimal("2000.00"))],
            event_date=start,
        )
        balance = ledger_service.get_agreement_balance(db, ag.id)
        assert balance == Decimal("4000.00")

    def test_no_vehicles_raises(self, db, customer):
        with pytest.raises(ValueError, match="[Aa]t least one"):
            wedding_agreement_service.create_wedding_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_configs=[],
                event_date=future(1),
            )

    def test_inactive_customer_raises(self, db, inactive_customer, v1):
        with pytest.raises(ValueError, match="[Nn]ot active"):
            wedding_agreement_service.create_wedding_agreement(
                db=db,
                customer_id=inactive_customer.id,
                vehicle_configs=[_cfg(v1, future(1), future(3))],
                event_date=future(1),
            )

    def test_nonexistent_customer_raises(self, db, v1):
        with pytest.raises(ValueError, match="[Nn]ot found"):
            wedding_agreement_service.create_wedding_agreement(
                db=db,
                customer_id=99999,
                vehicle_configs=[_cfg(v1, future(1), future(3))],
                event_date=future(1),
            )

    def test_end_before_start_raises(self, db, customer, v1):
        with pytest.raises(ValueError, match="[Aa]fter start"):
            wedding_agreement_service.create_wedding_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_configs=[_cfg(v1, future(3), future(1))],
                event_date=future(1),
            )

    def test_unavailable_vehicle_raises(self, db, customer, v1):
        v1.status = VehicleStatus.MAINTENANCE
        db.commit()
        with pytest.raises(ValueError, match="[Nn]ot available"):
            wedding_agreement_service.create_wedding_agreement(
                db=db,
                customer_id=customer.id,
                vehicle_configs=[_cfg(v1, future(1), future(3))],
                event_date=future(1),
            )

    def test_deposit_amount_stored(self, db, customer, v1):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, future(1), future(3))],
            event_date=future(1),
            deposit_amount=Decimal("10000.00"),
        )
        assert ag.deposit_amount == Decimal("10000.00")


# ---------------------------------------------------------------------------
# add_vehicle_to_wedding
# ---------------------------------------------------------------------------

class TestAddVehicleToWedding:

    def _create_wedding(self, db, customer, v1) -> Agreement:
        start = future(1)
        end = start + timedelta(days=2)
        return wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, start, end)],
            event_date=start,
        )

    def test_add_vehicle_creates_new_segment(self, db, customer, v1, v2):
        ag = self._create_wedding(db, customer, v1)
        start = future(1)
        end = start + timedelta(days=1)
        wedding_agreement_service.add_vehicle_to_wedding(
            db=db,
            agreement_id=ag.id,
            vehicle_id=v2.id,
            daily_rate=Decimal("1800.00"),
            start_datetime=start,
            end_datetime=end,
        )
        db.refresh(ag)
        assert len(ag.vehicle_segments) == 2

    def test_add_vehicle_posts_additional_charge(self, db, customer, v1, v2):
        ag = self._create_wedding(db, customer, v1)
        balance_before = ledger_service.get_agreement_balance(db, ag.id)
        start = future(1)
        end = start + timedelta(days=1)
        wedding_agreement_service.add_vehicle_to_wedding(
            db=db,
            agreement_id=ag.id,
            vehicle_id=v2.id,
            daily_rate=Decimal("1800.00"),
            start_datetime=start,
            end_datetime=end,
        )
        balance_after = ledger_service.get_agreement_balance(db, ag.id)
        assert balance_after > balance_before
        assert balance_after == balance_before + Decimal("1800.00")  # 1-day extension

    def test_add_vehicle_updates_total_rate(self, db, customer, v1, v2):
        ag = self._create_wedding(db, customer, v1)
        original_total = ag.agreed_daily_rate
        segment_charge = Decimal("1800.00")  # 1 day
        start = future(1)
        end = start + timedelta(days=1)
        wedding_agreement_service.add_vehicle_to_wedding(
            db=db,
            agreement_id=ag.id,
            vehicle_id=v2.id,
            daily_rate=Decimal("1800.00"),
            start_datetime=start,
            end_datetime=end,
        )
        db.refresh(ag)
        assert ag.agreed_daily_rate == original_total + segment_charge

    def test_add_vehicle_extends_return_date(self, db, customer, v1, v2):
        """Adding a vehicle with a later end extends the agreement's return date."""
        ag = self._create_wedding(db, customer, v1)
        new_start = future(5)
        new_end = new_start + timedelta(days=5)
        wedding_agreement_service.add_vehicle_to_wedding(
            db=db,
            agreement_id=ag.id,
            vehicle_id=v2.id,
            daily_rate=Decimal("1800.00"),
            start_datetime=new_start,
            end_datetime=new_end,
        )
        db.refresh(ag)
        assert ag.expected_return_datetime.date() == new_end.date()

    def test_add_vehicle_does_not_shorten_return_date(self, db, customer, v1, v2):
        """Adding a vehicle with an earlier end must NOT shorten the return date."""
        ag = self._create_wedding(db, customer, v1)
        original_return = ag.expected_return_datetime
        start = future(1)
        end = start + timedelta(days=1)
        wedding_agreement_service.add_vehicle_to_wedding(
            db=db,
            agreement_id=ag.id,
            vehicle_id=v2.id,
            daily_rate=Decimal("1800.00"),
            start_datetime=start,
            end_datetime=end,
        )
        db.refresh(ag)
        assert ag.expected_return_datetime.date() == original_return.date()

    def test_add_unavailable_vehicle_raises(self, db, customer, v1, v2):
        ag = self._create_wedding(db, customer, v1)
        v2.status = VehicleStatus.RENTED
        db.commit()
        start = future(1)
        end = start + timedelta(days=2)
        with pytest.raises(ValueError, match="[Nn]ot available"):
            wedding_agreement_service.add_vehicle_to_wedding(
                db=db,
                agreement_id=ag.id,
                vehicle_id=v2.id,
                daily_rate=Decimal("1800.00"),
                start_datetime=start,
                end_datetime=end,
            )

    def test_add_vehicle_end_before_start_raises(self, db, customer, v1, v2):
        ag = self._create_wedding(db, customer, v1)
        start = future(3)
        end = start - timedelta(days=2)
        with pytest.raises(ValueError, match="[Aa]fter start"):
            wedding_agreement_service.add_vehicle_to_wedding(
                db=db,
                agreement_id=ag.id,
                vehicle_id=v2.id,
                daily_rate=Decimal("1800.00"),
                start_datetime=start,
                end_datetime=end,
            )

    def test_add_vehicle_to_non_wedding_raises(self, db, customer, v1, v2):
        """Only WEDDING type agreements accept vehicle additions."""
        from src.models.agreement import Agreement
        from src.models.agreement_vehicle_segment import AgreementVehicleSegment
        ag = Agreement(
            agreement_number="AGR-NOTWED-001",
            agreement_type=AgreementType.STANDARD,
            status=AgreementStatus.ACTIVE,
            customer_id=customer.id,
            pickup_datetime=future(1),
            expected_return_datetime=future(3),
            agreed_daily_rate=Decimal("1500.00"),
        )
        db.add(ag)
        db.flush()
        seg = AgreementVehicleSegment(
            agreement_id=ag.id, vehicle_id=v1.id,
            start_datetime=future(1), end_datetime=future(3), daily_rate=Decimal("1500.00"),
        )
        db.add(seg)
        db.commit()

        with pytest.raises(ValueError, match="[Ww]edding"):
            wedding_agreement_service.add_vehicle_to_wedding(
                db=db,
                agreement_id=ag.id,
                vehicle_id=v2.id,
                daily_rate=Decimal("1800.00"),
                start_datetime=future(1),
                end_datetime=future(2),
            )

    def test_add_vehicle_to_nonexistent_agreement_raises(self, db, v2):
        with pytest.raises(ValueError, match="[Nn]ot found"):
            wedding_agreement_service.add_vehicle_to_wedding(
                db=db,
                agreement_id=99999,
                vehicle_id=v2.id,
                daily_rate=Decimal("1800.00"),
                start_datetime=future(1),
                end_datetime=future(2),
            )


# ---------------------------------------------------------------------------
# get_wedding_totals
# ---------------------------------------------------------------------------

class TestGetWeddingTotals:

    def test_totals_vehicle_count(self, db, customer, v1, v2):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[
                _cfg(v1, future(1), future(3)),
                _cfg(v2, future(1), future(2)),
            ],
            event_date=future(1),
        )
        totals = wedding_agreement_service.get_wedding_totals(db, ag.id)
        assert totals["vehicle_count"] == 2

    def test_totals_subtotal_matches_charges(self, db, customer, v1, v2):
        """Subtotal from totals matches what was posted to the ledger."""
        start1 = future(1)
        end1 = start1 + timedelta(days=2)
        start2 = future(1)
        end2 = start2 + timedelta(days=1)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[
                _cfg(v1, start1, end1, Decimal("2000.00")),
                _cfg(v2, start2, end2, Decimal("1800.00")),
            ],
            event_date=start1,
        )
        totals = wedding_agreement_service.get_wedding_totals(db, ag.id)
        assert totals["subtotal"] == Decimal("5800.00")
        assert totals["total_charges"] == Decimal("5800.00")

    def test_totals_balance_reflects_payments(self, db, customer, v1):
        from src.models.ledger_entry import PaymentMethod
        start = future(1)
        end = start + timedelta(days=2)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, start, end, Decimal("2000.00"))],
            event_date=start,
        )
        ledger_service.post_payment(
            db=db,
            agreement_id=ag.id,
            amount=Decimal("2000.00"),
            payment_method=PaymentMethod.CASH,
        )
        totals = wedding_agreement_service.get_wedding_totals(db, ag.id)
        assert totals["total_payments"] == Decimal("2000.00")
        assert totals["balance"] == Decimal("2000.00")  # 4000 charged - 2000 paid

    def test_totals_vehicles_list_populated(self, db, customer, v1, v2, v3):
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[
                _cfg(v1, future(1), future(2)),
                _cfg(v2, future(1), future(3)),
                _cfg(v3, future(2), future(4)),
            ],
            event_date=future(1),
        )
        totals = wedding_agreement_service.get_wedding_totals(db, ag.id)
        assert len(totals["vehicles"]) == 3
        for entry in totals["vehicles"]:
            assert "vehicle_id" in entry
            assert "days" in entry
            assert "daily_rate" in entry
            assert "total" in entry

    def test_totals_nonexistent_agreement_raises(self, db):
        with pytest.raises(ValueError, match="[Nn]ot found"):
            wedding_agreement_service.get_wedding_totals(db, 99999)

    def test_per_vehicle_day_calculation(self, db, customer, v1):
        """48-hour segment → 2 days; 25-hour segment → 2 days (ceiling)."""
        start = future(1)
        end_48h = start + timedelta(hours=48)
        ag = wedding_agreement_service.create_wedding_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_configs=[_cfg(v1, start, end_48h, Decimal("2000.00"))],
            event_date=start,
        )
        totals = wedding_agreement_service.get_wedding_totals(db, ag.id)
        vehicle_entry = totals["vehicles"][0]
        assert vehicle_entry["days"] == 2
        assert vehicle_entry["total"] == Decimal("4000.00")
