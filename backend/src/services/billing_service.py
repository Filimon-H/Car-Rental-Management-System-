"""Billing service for calculating rental charges."""

import math
from datetime import datetime, timedelta
from decimal import Decimal

from src.core.logging import get_logger

logger = get_logger(__name__)

# 24-hour billing: 1 day = 24 hours, partial days charged as full
HOURS_PER_DAY = 24


def calculate_rental_days(start: datetime, end: datetime) -> int:
    """Calculate number of billable days.
    
    Rules:
    - 1 day = 24 hours
    - Any partial day is charged as full day
    - Minimum 1 day
    
    Examples:
        23 hours -> 1 day
        25 hours -> 2 days
        48 hours -> 2 days
        49 hours -> 3 days
    """
    if end <= start:
        return 1
    
    delta = end - start
    total_hours = delta.total_seconds() / 3600
    days = math.ceil(total_hours / HOURS_PER_DAY)
    
    return max(1, days)


def calculate_rental_charge(
    start: datetime,
    end: datetime,
    daily_rate: Decimal,
) -> tuple[int, Decimal]:
    """Calculate rental charge for a period.
    
    Args:
        start: Rental start datetime
        end: Rental end datetime
        daily_rate: Daily rate in ETB
    
    Returns:
        Tuple of (number_of_days, total_charge)
    """
    days = calculate_rental_days(start, end)
    total = daily_rate * days
    
    logger.debug(f"Calculated rental: {start} to {end} = {days} days @ {daily_rate} = {total}")
    
    return days, total


def calculate_late_fee(
    expected_return: datetime,
    actual_return: datetime,
    daily_rate: Decimal,
    late_fee_multiplier: Decimal = Decimal("1.5"),
) -> Decimal:
    """Calculate late return fee.
    
    Late fee is charged at 1.5x daily rate for each additional day.
    
    Args:
        expected_return: Originally expected return datetime
        actual_return: Actual return datetime
        daily_rate: Daily rate in ETB
        late_fee_multiplier: Multiplier for late days (default 1.5x)
    
    Returns:
        Late fee amount (0 if returned on time or early)
    """
    if actual_return <= expected_return:
        return Decimal("0")
    
    late_days = calculate_rental_days(expected_return, actual_return)
    late_fee = daily_rate * late_fee_multiplier * late_days
    
    logger.info(f"Late fee calculated: {late_days} days @ {daily_rate} x {late_fee_multiplier} = {late_fee}")
    
    return late_fee


def calculate_extension_charge(
    current_end: datetime,
    new_end: datetime,
    daily_rate: Decimal,
) -> tuple[int, Decimal]:
    """Calculate charge for extending a rental.
    
    Args:
        current_end: Current expected return datetime
        new_end: New expected return datetime
    
    Returns:
        Tuple of (additional_days, extension_charge)
    """
    if new_end <= current_end:
        return 0, Decimal("0")
    
    return calculate_rental_charge(current_end, new_end, daily_rate)


def calculate_mileage_charge(
    start_mileage: int,
    end_mileage: int,
    free_km_per_day: int,
    rental_days: int,
    excess_km_rate: Decimal,
) -> tuple[int, Decimal]:
    """Calculate excess mileage charge.
    
    Args:
        start_mileage: Mileage at rental start
        end_mileage: Mileage at rental end
        free_km_per_day: Free kilometers per day
        rental_days: Number of rental days
        excess_km_rate: Rate per excess km
    
    Returns:
        Tuple of (excess_km, mileage_charge)
    """
    total_km = max(0, end_mileage - start_mileage)
    free_km = free_km_per_day * rental_days
    excess_km = max(0, total_km - free_km)
    
    charge = excess_km_rate * excess_km
    
    return excess_km, charge
