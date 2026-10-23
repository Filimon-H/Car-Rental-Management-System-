"""A with-driver agreement must actually record its driver and collateral.

QA created agreement AGR-20260922-0001 through the form with a driver and a
collateral person both selected, and both came back null — so the agreement's
type said "with driver" while its contents said otherwise.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import Agreement, AgreementType
from src.models.collateral_person import CollateralPerson
from src.models.customer import Customer
from src.models.driver import Driver
from src.models.vehicle import Vehicle
from src.models.vendor import Vendor

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


@pytest.fixture
def driver(db: Session) -> Driver:
    d = Driver(
        first_name="Dawit",
        last_name="Tesfaye",
        phone_primary="+251911556677",
        license_number="QA-DL-7701",
        is_active=True,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@pytest.fixture
def collateral(db: Session, test_customer: Customer) -> CollateralPerson:
    c = CollateralPerson(
        customer_id=test_customer.id,
        first_name="Almaz",
        last_name="Bekele",
        phone_primary="+251911223355",
        id_type="national_id",
        id_number="QA-NID-9001",
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def payload(customer_id: int, vehicle_id: int, **overrides) -> dict:
    pickup = datetime.now(timezone.utc) + timedelta(days=3)
    body = {
        "agreement_type": "customer_vehicle_driver",
        "customer_id": customer_id,
        "vehicle_id": vehicle_id,
        "pickup_datetime": pickup.isoformat(),
        "expected_return_datetime": (pickup + timedelta(days=3)).isoformat(),
        "daily_rate": "1200.00",
        "deposit_amount": "5000.00",
    }
    body.update(overrides)
    return body


class TestDriverAndCollateralArePersisted:
    def test_both_are_stored_and_returned(
        self, client, db: Session, test_customer, test_vehicle, driver, collateral, auth_headers
    ):
        response = client.post(
            "/api/agreements",
            headers=auth_headers,
            json=payload(
                test_customer.id,
                test_vehicle.id,
                driver_id=driver.id,
                collateral_person_id=collateral.id,
            ),
        )
        assert response.status_code == 201, response.text

        body = response.json()
        assert body["driver_id"] == driver.id
        assert body["collateral_person_id"] == collateral.id

        # Assert against the row too — the response is built field by field,
        # so it could report a value that was never written.
        stored = db.query(Agreement).filter(Agreement.id == body["id"]).one()
        assert stored.driver_id == driver.id
        assert stored.collateral_person_id == collateral.id

    def test_they_survive_a_reload(
        self, client, test_customer, test_vehicle, driver, collateral, auth_headers
    ):
        created = client.post(
            "/api/agreements",
            headers=auth_headers,
            json=payload(
                test_customer.id,
                test_vehicle.id,
                driver_id=driver.id,
                collateral_person_id=collateral.id,
            ),
        )
        agreement_id = created.json()["id"]

        fetched = client.get(f"/api/agreements/{agreement_id}", headers=auth_headers)
        assert fetched.status_code == 200
        assert fetched.json()["driver_id"] == driver.id
        assert fetched.json()["collateral_person_id"] == collateral.id


class TestWithDriverRequiresADriver:
    def test_omitting_the_driver_is_refused(
        self, client, test_customer, test_vehicle, collateral, auth_headers
    ):
        # Storing a with-driver agreement with driver_id null is what made the
        # UI bug invisible; the API now refuses it outright.
        response = client.post(
            "/api/agreements",
            headers=auth_headers,
            json=payload(
                test_customer.id, test_vehicle.id, collateral_person_id=collateral.id
            ),
        )
        assert response.status_code == 400, response.text
        assert "driver is required" in response.json()["detail"].lower()

    def test_a_plain_agreement_still_needs_no_driver(
        self, client, test_customer, test_vehicle, collateral, auth_headers
    ):
        response = client.post(
            "/api/agreements",
            headers=auth_headers,
            json=payload(
                test_customer.id,
                test_vehicle.id,
                agreement_type="customer_vehicle",
                collateral_person_id=collateral.id,
            ),
        )
        assert response.status_code == 201, response.text
        assert response.json()["driver_id"] is None


class TestCollateralMustBelongToTheCustomer:
    def test_another_customers_collateral_is_refused(
        self, client, db: Session, test_customer, test_vehicle, driver, auth_headers
    ):
        other = Customer(
            first_name="Someone",
            last_name="Else",
            phone_primary="+251911000999",
            id_type="national_id",
            id_number="QA-NID-9002",
            is_active=True,
        )
        db.add(other)
        db.commit()
        db.refresh(other)

        foreign = CollateralPerson(
            customer_id=other.id,
            first_name="Not",
            last_name="Yours",
            phone_primary="+251911000998",
            id_type="national_id",
            id_number="QA-NID-9003",
            is_active=True,
        )
        db.add(foreign)
        db.commit()
        db.refresh(foreign)

        response = client.post(
            "/api/agreements",
            headers=auth_headers,
            json=payload(
                test_customer.id,
                test_vehicle.id,
                driver_id=driver.id,
                collateral_person_id=foreign.id,
            ),
        )
        assert response.status_code == 400, response.text
        assert "does not belong" in response.json()["detail"].lower()


class TestInvertedDates:
    def test_return_before_pickup_is_refused(
        self, client, test_customer, test_vehicle, driver, collateral, auth_headers
    ):
        pickup = datetime.now(timezone.utc) + timedelta(days=5)
        response = client.post(
            "/api/agreements",
            headers=auth_headers,
            json=payload(
                test_customer.id,
                test_vehicle.id,
                driver_id=driver.id,
                collateral_person_id=collateral.id,
                pickup_datetime=pickup.isoformat(),
                expected_return_datetime=(pickup - timedelta(days=3)).isoformat(),
            ),
        )
        assert response.status_code == 400, response.text
        assert "after pickup" in response.json()["detail"].lower()
