"""Business dates must print exactly as they are stored.

Two kinds of timestamp live in this system: true UTC instants (created_at,
audit rows) and local business wall-clock (pickup, expected return). The
bot's EAT fix tagged the naive wall-clock value as UTC and converted it,
which added three hours — a rental due 8 January at 23:59 was shown as due
9 January, so the date itself rolled and staff chased the wrong day.
"""
from datetime import datetime, timezone

import pytest

from src.services.telegram_bot_service import format_business_datetime


class TestWallClockValuesArePrintedUnchanged:
    @pytest.mark.parametrize(
        "stored,expected",
        [
            # QA's two overdue agreements, exactly as stored.
            (datetime(2026, 1, 8, 23, 59), "2026-01-08 23:59 EAT"),
            (datetime(2026, 5, 13, 10, 0), "2026-05-13 10:00 EAT"),
            # Midnight is the boundary the rollover bug crossed.
            (datetime(2026, 3, 1, 0, 0), "2026-03-01 00:00 EAT"),
            (datetime(2026, 12, 31, 23, 0), "2026-12-31 23:00 EAT"),
        ],
    )
    def test_a_naive_value_is_not_shifted(self, stored, expected):
        assert format_business_datetime(stored) == expected

    def test_the_date_does_not_roll(self):
        """23:59 on the 8th must not become the 9th."""
        assert format_business_datetime(datetime(2026, 1, 8, 23, 59)).startswith(
            "2026-01-08"
        )

    def test_a_custom_format_is_honoured(self):
        assert format_business_datetime(datetime(2026, 5, 13, 10, 0), "%H:%M") == "10:00 EAT"


class TestAwareValuesAreConverted:
    def test_a_real_utc_instant_is_converted_to_local(self):
        """An aware value is a true instant, so it does convert: +3."""
        aware = datetime(2026, 5, 13, 7, 0, tzinfo=timezone.utc)
        assert format_business_datetime(aware) == "2026-05-13 10:00 EAT"
