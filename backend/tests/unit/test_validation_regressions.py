"""Regression tests for invalid customer and agreement data."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from tests.unit.test_agreement_service import customer, vehicle  # noqa: F401
from src.core.errors import BusinessError
from src.schemas.customer import CustomerCreate
from src.services import agreement_service, wedding_agreement_service
from src.services.customer_validation_service import find_customer_by_phone


def test_individual_customer_requires_identity_fields():
    with pytest.raises(ValidationError):
        CustomerCreate(
            first_name="Nardos",
            last_name="Mesfin",
            phone_primary="0910029713",
            business_type="individual",
        )


def test_duplicate_phone_matches_local_and_country_code(db, customer):
    customer.phone_primary = "0910029713"
    db.commit()
    assert find_customer_by_phone(db, "+251 910-029-713").id == customer.id


def test_staff_agreement_rejects_past_pickup(db, customer, vehicle):
    pickup = datetime.now(timezone.utc) - timedelta(days=2)
    with pytest.raises(BusinessError, match="Pickup date must be in the future"):
        agreement_service.create_standard_agreement(
            db, customer.id, vehicle.id, pickup, pickup + timedelta(days=1),
            Decimal("100"),
        )


def test_wedding_agreement_rejects_past_start(db, customer, vehicle):
    pickup = datetime.now(timezone.utc) - timedelta(days=2)
    with pytest.raises(ValueError, match="start date must be in the future"):
        wedding_agreement_service.create_wedding_agreement(
            db,
            customer.id,
            [{"vehicle_id": vehicle.id, "daily_rate": Decimal("100"),
              "start": pickup, "end": pickup + timedelta(days=1)}],
            event_date=pickup,
        )


@pytest.mark.parametrize("transition", ["returned", "closed"])
def test_return_before_pickup_is_rejected(db, customer, vehicle, transition):
    agreement = agreement_service.create_standard_agreement(
        db, customer.id, vehicle.id,
        datetime.now(timezone.utc) + timedelta(days=1),
        datetime.now(timezone.utc) + timedelta(days=3),
        Decimal("100"),
    )
    agreement.status = "active"
    db.commit()
    action = (
        agreement_service.mark_agreement_returned
        if transition == "returned"
        else agreement_service.close_agreement
    )
    with pytest.raises(BusinessError, match="cannot be before pickup"):
        action(db, agreement.id, datetime.now(timezone.utc))
