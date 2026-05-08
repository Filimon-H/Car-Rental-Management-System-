"""Unit tests for billing service — pure calculation functions (no DB required)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from src.services import billing_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def dt(hours_from_now: float = 0) -> datetime:
    """Return a UTC datetime offset by the given hours."""
    return datetime.now(timezone.utc) + timedelta(hours=hours_from_now)


def dt_fixed(year=2024, month=1, day=1, hour=10) -> datetime:
    """Return a fixed UTC datetime for deterministic tests."""
    return datetime(year, month, day, hour, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# calculate_rental_days
# ---------------------------------------------------------------------------

class TestCalculateRentalDays:
    """24-hour block billing: partial day always rounds UP to full day."""

    def test_exactly_24_hours_is_1_day(self):
        start = dt_fixed(hour=10)
        end = dt_fixed(hour=10) + timedelta(hours=24)
        assert billing_service.calculate_rental_days(start, end) == 1

    def test_23_hours_rounds_up_to_1_day(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=23)
        assert billing_service.calculate_rental_days(start, end) == 1

    def test_1_hour_is_minimum_1_day(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=1)
        assert billing_service.calculate_rental_days(start, end) == 1

    def test_25_hours_rounds_up_to_2_days(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=25)
        assert billing_service.calculate_rental_days(start, end) == 2

    def test_48_hours_exactly_is_2_days(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=48)
        assert billing_service.calculate_rental_days(start, end) == 2

    def test_49_hours_rounds_up_to_3_days(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=49)
        assert billing_service.calculate_rental_days(start, end) == 3

    def test_3_days_exactly(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(days=3)
        assert billing_service.calculate_rental_days(start, end) == 3

    def test_3_days_and_1_second_rounds_to_4(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(days=3, seconds=1)
        assert billing_service.calculate_rental_days(start, end) == 4

    def test_end_before_start_returns_1_minimum(self):
        start = dt_fixed(hour=10)
        end = start - timedelta(hours=5)
        assert billing_service.calculate_rental_days(start, end) == 1

    def test_end_equal_start_returns_1_minimum(self):
        start = dt_fixed(hour=10)
        assert billing_service.calculate_rental_days(start, start) == 1

    def test_30_minutes_is_1_day(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(minutes=30)
        assert billing_service.calculate_rental_days(start, end) == 1


# ---------------------------------------------------------------------------
# calculate_rental_charge
# ---------------------------------------------------------------------------

class TestCalculateRentalCharge:
    """Rental charge = days × daily_rate."""

    def test_returns_days_and_amount_tuple(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(days=3)
        rate = Decimal("1500.00")
        result = billing_service.calculate_rental_charge(start, end, rate)
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_1_day_charge(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=20)
        rate = Decimal("1500.00")
        days, charge = billing_service.calculate_rental_charge(start, end, rate)
        assert days == 1
        assert charge == Decimal("1500.00")

    def test_3_day_charge(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(days=3)
        rate = Decimal("1500.00")
        days, charge = billing_service.calculate_rental_charge(start, end, rate)
        assert days == 3
        assert charge == Decimal("4500.00")

    def test_partial_day_rounds_up_in_charge(self):
        """25 hours → 2 days billed."""
        start = dt_fixed(hour=10)
        end = start + timedelta(hours=25)
        rate = Decimal("1000.00")
        days, charge = billing_service.calculate_rental_charge(start, end, rate)
        assert days == 2
        assert charge == Decimal("2000.00")

    def test_zero_rate_gives_zero_charge(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(days=5)
        days, charge = billing_service.calculate_rental_charge(start, end, Decimal("0"))
        assert days == 5
        assert charge == Decimal("0")

    def test_fractional_daily_rate(self):
        start = dt_fixed(hour=10)
        end = start + timedelta(days=2)
        rate = Decimal("1250.50")
        days, charge = billing_service.calculate_rental_charge(start, end, rate)
        assert days == 2
        assert charge == Decimal("2501.00")


# ---------------------------------------------------------------------------
# calculate_late_fee
# ---------------------------------------------------------------------------

class TestCalculateLateFee:
    """Late fee = daily_rate × 1.5 × ceil(late_hours / 24)."""

    def test_on_time_return_zero_fee(self):
        expected = dt_fixed(day=5, hour=10)
        actual = dt_fixed(day=5, hour=10)  # same time
        assert billing_service.calculate_late_fee(expected, actual, Decimal("1500")) == Decimal("0")

    def test_early_return_zero_fee(self):
        expected = dt_fixed(day=5, hour=10)
        actual = expected - timedelta(hours=3)
        assert billing_service.calculate_late_fee(expected, actual, Decimal("1500")) == Decimal("0")

    def test_1_day_late_fee_is_1_5x_rate(self):
        expected = dt_fixed(day=5, hour=10)
        actual = expected + timedelta(hours=24)
        fee = billing_service.calculate_late_fee(expected, actual, Decimal("1000.00"))
        assert fee == Decimal("1500.00")  # 1000 × 1.5 × 1 day

    def test_2_days_late_fee(self):
        expected = dt_fixed(day=5, hour=10)
        actual = expected + timedelta(hours=48)
        fee = billing_service.calculate_late_fee(expected, actual, Decimal("1000.00"))
        assert fee == Decimal("3000.00")  # 1000 × 1.5 × 2 days

    def test_partial_late_day_rounds_up(self):
        """1 hour late should still charge for 1 full late day."""
        expected = dt_fixed(day=5, hour=10)
        actual = expected + timedelta(hours=1)
        fee = billing_service.calculate_late_fee(expected, actual, Decimal("1000.00"))
        assert fee == Decimal("1500.00")  # 1 partial late day → 1 full late day charged

    def test_25_hours_late_charges_2_days(self):
        expected = dt_fixed(day=5, hour=10)
        actual = expected + timedelta(hours=25)
        fee = billing_service.calculate_late_fee(expected, actual, Decimal("1000.00"))
        assert fee == Decimal("3000.00")  # ceil(25/24) = 2 days

    def test_custom_multiplier_2x(self):
        expected = dt_fixed(day=5, hour=10)
        actual = expected + timedelta(hours=24)
        fee = billing_service.calculate_late_fee(
            expected, actual, Decimal("1000.00"), late_fee_multiplier=Decimal("2.0")
        )
        assert fee == Decimal("2000.00")

    def test_high_daily_rate_late_fee(self):
        expected = dt_fixed(day=1, hour=10)
        actual = expected + timedelta(days=3)
        fee = billing_service.calculate_late_fee(expected, actual, Decimal("5000.00"))
        assert fee == Decimal("22500.00")  # 5000 × 1.5 × 3


# ---------------------------------------------------------------------------
# calculate_extension_charge
# ---------------------------------------------------------------------------

class TestCalculateExtensionCharge:
    """Extension charge mirrors rental_charge for the gap period."""

    def test_extension_returns_days_and_amount(self):
        current_end = dt_fixed(day=5, hour=10)
        new_end = current_end + timedelta(days=2)
        result = billing_service.calculate_extension_charge(current_end, new_end, Decimal("1500"))
        assert isinstance(result, tuple) and len(result) == 2

    def test_2_day_extension_charge(self):
        current_end = dt_fixed(day=5, hour=10)
        new_end = current_end + timedelta(days=2)
        days, charge = billing_service.calculate_extension_charge(current_end, new_end, Decimal("1500"))
        assert days == 2
        assert charge == Decimal("3000.00")

    def test_new_end_before_current_returns_zero(self):
        current_end = dt_fixed(day=5, hour=10)
        new_end = current_end - timedelta(days=1)
        days, charge = billing_service.calculate_extension_charge(current_end, new_end, Decimal("1500"))
        assert days == 0
        assert charge == Decimal("0")

    def test_new_end_equal_current_returns_zero(self):
        current_end = dt_fixed(day=5, hour=10)
        days, charge = billing_service.calculate_extension_charge(current_end, current_end, Decimal("1500"))
        assert days == 0
        assert charge == Decimal("0")

    def test_partial_extension_day_rounds_up(self):
        current_end = dt_fixed(day=5, hour=10)
        new_end = current_end + timedelta(hours=25)  # 1 full + 1 partial day → 2 days
        days, charge = billing_service.calculate_extension_charge(current_end, new_end, Decimal("1000"))
        assert days == 2
        assert charge == Decimal("2000.00")


# ---------------------------------------------------------------------------
# calculate_mileage_charge
# ---------------------------------------------------------------------------

class TestCalculateMileageCharge:
    """Excess km charge = (total_km - free_km) × rate, min 0."""

    def test_no_km_driven_no_charge(self):
        excess, charge = billing_service.calculate_mileage_charge(
            start_mileage=10000,
            end_mileage=10000,
            free_km_per_day=200,
            rental_days=3,
            excess_km_rate=Decimal("5.00"),
        )
        assert excess == 0
        assert charge == Decimal("0")

    def test_within_free_km_no_charge(self):
        # 3 days × 200 free km = 600 km free; drove 500
        excess, charge = billing_service.calculate_mileage_charge(
            start_mileage=0,
            end_mileage=500,
            free_km_per_day=200,
            rental_days=3,
            excess_km_rate=Decimal("5.00"),
        )
        assert excess == 0
        assert charge == Decimal("0")

    def test_exactly_at_free_km_limit_no_charge(self):
        # 3 days × 200 km = 600 free; drove exactly 600
        excess, charge = billing_service.calculate_mileage_charge(
            start_mileage=0,
            end_mileage=600,
            free_km_per_day=200,
            rental_days=3,
            excess_km_rate=Decimal("5.00"),
        )
        assert excess == 0
        assert charge == Decimal("0")

    def test_excess_km_charged_correctly(self):
        # 3 days × 200 km = 600 free; drove 700 → 100 excess × 5.00
        excess, charge = billing_service.calculate_mileage_charge(
            start_mileage=0,
            end_mileage=700,
            free_km_per_day=200,
            rental_days=3,
            excess_km_rate=Decimal("5.00"),
        )
        assert excess == 100
        assert charge == Decimal("500.00")

    def test_returns_excess_km_and_charge_tuple(self):
        result = billing_service.calculate_mileage_charge(
            start_mileage=0,
            end_mileage=1000,
            free_km_per_day=100,
            rental_days=2,
            excess_km_rate=Decimal("3.00"),
        )
        assert isinstance(result, tuple) and len(result) == 2

    def test_end_mileage_less_than_start_no_charge(self):
        """Odometer rollback or data error — treated as zero km driven."""
        excess, charge = billing_service.calculate_mileage_charge(
            start_mileage=10000,
            end_mileage=9000,
            free_km_per_day=100,
            rental_days=2,
            excess_km_rate=Decimal("5.00"),
        )
        assert excess == 0
        assert charge == Decimal("0")

    def test_zero_free_km_all_km_charged(self):
        excess, charge = billing_service.calculate_mileage_charge(
            start_mileage=0,
            end_mileage=100,
            free_km_per_day=0,
            rental_days=1,
            excess_km_rate=Decimal("10.00"),
        )
        assert excess == 100
        assert charge == Decimal("1000.00")
