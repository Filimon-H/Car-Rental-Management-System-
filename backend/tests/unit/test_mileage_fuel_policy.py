"""Excess-mileage and fuel charges are posted on close only when a policy was agreed."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.ledger_entry import LedgerEntry
from src.models.vehicle import Vehicle
from src.services import agreement_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    test_customer,
    test_vehicle,
)


def _charge_descriptions(db: Session, agreement_id: int) -> list[str]:
    return [
        e.description
        for e in db.query(LedgerEntry).filter(LedgerEntry.agreement_id == agreement_id)
    ]


def _total(db: Session, agreement_id: int) -> Decimal:
    return sum(
        (e.amount for e in db.query(LedgerEntry).filter(LedgerEntry.agreement_id == agreement_id)),
        Decimal("0"),
    )


@pytest.fixture
def active_agreement(db: Session, test_customer, test_vehicle):  # noqa: F811
    # A booking cannot be made for the past, so create it legally and then
    # backdate the stored rows to model a car that is already out.
    pickup = datetime.now(timezone.utc) - timedelta(days=3)
    lead = datetime.now(timezone.utc) + timedelta(days=1)
    ag = agreement_service.create_standard_agreement(
        db=db, customer_id=test_customer.id, vehicle_id=test_vehicle.id,
        pickup_datetime=lead, expected_return_datetime=lead + timedelta(days=3),
        daily_rate=Decimal("1000.00"),
    )
    ag.pickup_datetime = pickup
    ag.expected_return_datetime = pickup + timedelta(days=3)
    for segment in ag.vehicle_segments:
        segment.start_datetime = pickup
        segment.end_datetime = pickup + timedelta(days=3)
    db.commit()
    ag.pickup_mileage = 10_000
    agreement_service.activate_agreement(db, ag.id)
    db.commit()
    return ag


class TestExcessMileage:
    def test_charged_when_over_allowance(self, db: Session, active_agreement):
        """3 days x 200km = 600km allowance; 750km driven = 150km excess @ 15."""
        active_agreement.mileage_limit_per_day = 200
        active_agreement.excess_mileage_rate = Decimal("15.00")
        db.commit()

        agreement_service.close_agreement(
            db=db, agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.expected_return_datetime,
            return_mileage=10_750,
        )
        descriptions = _charge_descriptions(db, active_agreement.id)
        assert any(
            "Excess mileage: 150 km over 600 km allowance (3 days × 200 km/day)" in d
            for d in descriptions
        ), descriptions

    def test_early_return_keeps_allowance_for_all_billed_days(
        self, db: Session, active_agreement
    ):
        """A partial second contracted day is billed and grants its mileage allowance."""
        active_agreement.expected_return_datetime = (
            active_agreement.pickup_datetime + timedelta(hours=25)
        )
        active_agreement.mileage_limit_per_day = 200
        active_agreement.excess_mileage_rate = Decimal("15.00")
        db.commit()

        agreement_service.close_agreement(
            db=db,
            agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.pickup_datetime + timedelta(hours=1),
            return_mileage=10_500,
        )

        entries = db.query(LedgerEntry).filter(
            LedgerEntry.agreement_id == active_agreement.id,
            LedgerEntry.description.contains("Excess mileage"),
        ).all()
        assert len(entries) == 1
        assert entries[0].amount == Decimal("1500.00")
        assert entries[0].description == (
            "Excess mileage: 100 km over 400 km allowance (2 days × 200 km/day)"
        )

    def test_not_charged_within_allowance(self, db: Session, active_agreement):
        active_agreement.mileage_limit_per_day = 200
        active_agreement.excess_mileage_rate = Decimal("15.00")
        db.commit()

        agreement_service.close_agreement(
            db=db, agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.expected_return_datetime,
            return_mileage=10_500,  # 500km, under the 600km allowance
        )
        assert not any("Excess mileage" in d for d in _charge_descriptions(db, active_agreement.id))

    def test_no_policy_means_unlimited(self, db: Session, active_agreement):
        """Without a policy, even huge mileage is not charged — previous behaviour."""
        agreement_service.close_agreement(
            db=db, agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.expected_return_datetime,
            return_mileage=99_999,
        )
        assert not any("Excess mileage" in d for d in _charge_descriptions(db, active_agreement.id))


class TestFuelCharge:
    def test_shortfall_charged(self, db: Session, active_agreement):
        """Out at 100%, back at 60% = 40% shortfall @ 8/percent = 320."""
        active_agreement.fuel_level_out = 100
        active_agreement.fuel_charge_rate = Decimal("8.00")
        db.commit()
        before = _total(db, active_agreement.id)

        agreement_service.close_agreement(
            db=db, agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.expected_return_datetime,
            fuel_level_in=60,
        )
        descriptions = _charge_descriptions(db, active_agreement.id)
        assert any("Fuel shortfall: 40%" in d for d in descriptions), descriptions

    def test_returned_full_not_charged(self, db: Session, active_agreement):
        active_agreement.fuel_level_out = 100
        active_agreement.fuel_charge_rate = Decimal("8.00")
        db.commit()

        agreement_service.close_agreement(
            db=db, agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.expected_return_datetime,
            fuel_level_in=100,
        )
        assert not any("Fuel shortfall" in d for d in _charge_descriptions(db, active_agreement.id))

    def test_returned_fuller_not_credited(self, db: Session, active_agreement):
        """Returning with more fuel than taken must not create a negative charge."""
        active_agreement.fuel_level_out = 50
        active_agreement.fuel_charge_rate = Decimal("8.00")
        db.commit()

        agreement_service.close_agreement(
            db=db, agreement_id=active_agreement.id,
            actual_return_datetime=active_agreement.expected_return_datetime,
            fuel_level_in=90,
        )
        assert not any("Fuel shortfall" in d for d in _charge_descriptions(db, active_agreement.id))
