"""Tiered pricing must never charge more than the flat daily price."""
from decimal import Decimal

import pytest

from src.services.billing_service import calculate_tiered_charge

DAILY = Decimal("1000.00")
WEEKLY = Decimal("6000.00")    # 7 days for the price of 6
MONTHLY = Decimal("24000.00")  # 30 days for the price of 24


class TestNoTiersConfigured:
    """With no tiers set, pricing is unchanged — existing vehicles are unaffected."""

    @pytest.mark.parametrize("days", [1, 3, 7, 15, 30, 45, 100])
    def test_falls_back_to_daily(self, days):
        assert calculate_tiered_charge(days, DAILY) == DAILY * days


class TestWeeklyTier:
    def test_exact_week_uses_weekly_rate(self):
        assert calculate_tiered_charge(7, DAILY, WEEKLY) == WEEKLY

    def test_ten_days_is_week_plus_three_days(self):
        assert calculate_tiered_charge(10, DAILY, WEEKLY) == WEEKLY + DAILY * 3

    def test_two_weeks(self):
        assert calculate_tiered_charge(14, DAILY, WEEKLY) == WEEKLY * 2

    def test_six_days_stays_daily_when_cheaper(self):
        """A 6-day rental must not be rounded up to a full week."""
        assert calculate_tiered_charge(6, DAILY, WEEKLY) == DAILY * 6

    def test_remainder_capped_at_next_tier(self):
        """13 days = 1 week + 6 days; the 6-day tail must not exceed a second week."""
        result = calculate_tiered_charge(13, DAILY, WEEKLY)
        assert result == WEEKLY + min(DAILY * 6, WEEKLY)
        assert result <= DAILY * 13


class TestMonthlyTier:
    def test_exact_month(self):
        assert calculate_tiered_charge(30, DAILY, WEEKLY, MONTHLY) == MONTHLY

    def test_month_plus_week(self):
        assert calculate_tiered_charge(37, DAILY, WEEKLY, MONTHLY) == MONTHLY + WEEKLY

    def test_two_months(self):
        assert calculate_tiered_charge(60, DAILY, WEEKLY, MONTHLY) == MONTHLY * 2


class TestNeverWorseThanDaily:
    """The core invariant: a tier must never make the customer pay more."""

    @pytest.mark.parametrize("days", range(1, 95))
    def test_tiered_never_exceeds_flat_daily(self, days):
        tiered = calculate_tiered_charge(days, DAILY, WEEKLY, MONTHLY)
        assert tiered <= DAILY * days, f"{days} days: {tiered} > flat {DAILY * days}"

    @pytest.mark.parametrize("days", range(1, 95))
    def test_expensive_tiers_are_ignored(self, days):
        """Tiers priced above daily must never be selected."""
        bad_weekly = DAILY * 10   # more than 7 days of daily
        bad_monthly = DAILY * 50  # more than 30 days of daily
        assert calculate_tiered_charge(days, DAILY, bad_weekly, bad_monthly) == DAILY * days


class TestEdgeCases:
    def test_zero_days(self):
        assert calculate_tiered_charge(0, DAILY, WEEKLY) == Decimal("0")

    def test_negative_days(self):
        assert calculate_tiered_charge(-5, DAILY, WEEKLY) == Decimal("0")

    def test_zero_rate_tiers_ignored(self):
        assert calculate_tiered_charge(10, DAILY, Decimal("0"), Decimal("0")) == DAILY * 10
