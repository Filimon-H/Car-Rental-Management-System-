"""Agreements, receipts and inspection reports must be printable and right.

They were written as .txt files and downloaded, so staff had nothing to
print or sign. They are now self-contained HTML a browser can print or save
as PDF. Because that page opens on the admin app's origin, every value must
be escaped: an unescaped customer name could run script with a staff token.

Rewriting them also fixed three defects in the agreement: pickup and return
were shifted three hours late, the balance read the held deposit off the
total, and the driver on a with-driver agreement was never mentioned.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import AgreementType
from src.models.driver import Driver
from src.models.ledger_entry import PaymentMethod
from src.services import agreement_service, ledger_service, printing_service

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
    test_vehicle,
)


def read(path: str) -> str:
    with open(path) as handle:
        return handle.read()


@pytest.fixture
def agreement(db: Session, test_customer, test_vehicle):
    pickup = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=5)
    ag = agreement_service.create_standard_agreement(
        db=db,
        customer_id=test_customer.id,
        vehicle_id=test_vehicle.id,
        pickup_datetime=pickup,
        expected_return_datetime=pickup + timedelta(days=3),
        daily_rate=Decimal("1500.00"),
        deposit_amount=Decimal("5000.00"),
    )
    ledger_service.post_deposit(
        db, ag.id, amount=Decimal("5000.00"), payment_method=PaymentMethod.CASH
    )
    return ag


class TestDocumentsArePrintable:
    def test_an_agreement_is_html_not_text(self, db: Session, agreement):
        doc = printing_service.generate_agreement_document(db, agreement.id)
        assert doc["filename"].endswith(".html"), doc["filename"]
        body = read(doc["filepath"])
        assert body.lstrip().lower().startswith("<!doctype html>")
        assert "@media print" in body, "no print styling"

    def test_a_receipt_is_html(self, db: Session, agreement):
        ledger_service.post_payment(
            db, agreement.id, amount=Decimal("1000.00"), payment_method=PaymentMethod.CASH
        )
        doc = printing_service.generate_receipt(db, agreement.id)
        assert doc["filename"].endswith(".html")
        assert "1,000.00" in read(doc["filepath"])

    def test_the_download_is_served_as_html(self, client, auth_headers, db: Session, agreement):
        doc = printing_service.generate_agreement_document(db, agreement.id)
        r = client.get(f"/api/documents/download/{doc['filename']}", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/html"), r.headers["content-type"]


class TestValuesAreEscaped:
    def test_markup_in_a_customer_name_is_inert(self, db: Session, agreement, test_customer):
        test_customer.first_name = '<script>alert("x")</script>'
        db.commit()

        body = read(printing_service.generate_agreement_document(db, agreement.id)["filepath"])

        assert "<script>alert" not in body, "customer name rendered as markup"
        assert "&lt;script&gt;" in body

    def test_markup_in_notes_is_inert(self, db: Session, agreement):
        agreement.notes = '<img src=x onerror="fetch(1)">'
        db.commit()

        body = read(printing_service.generate_agreement_document(db, agreement.id)["filepath"])

        assert "<img src=x" not in body
        assert "&lt;img" in body


class TestTheAgreementIsCorrect:
    def test_pickup_prints_at_the_time_it_was_booked(self, db: Session, agreement):
        """Business dates are local wall-clock; they were printed +3 hours."""
        body = read(printing_service.generate_agreement_document(db, agreement.id)["filepath"])
        assert "09:00 AM" in body, "pickup time shifted"
        assert "12:00 PM" not in body

    def test_the_balance_matches_the_rest_of_the_system(self, db: Session, agreement):
        """The signed row sum nets the held deposit off: 5,000 low."""
        expected = agreement_service.get_balance_breakdown(db, agreement.id)["balance_due"]
        body = read(printing_service.generate_agreement_document(db, agreement.id)["filepath"])
        assert f"{expected:,.2f}" in body, f"balance {expected} not on the agreement"

    def test_the_driver_is_on_a_with_driver_agreement(self, db: Session, agreement):
        driver = Driver(
            first_name="Kebede",
            last_name="Alemu",
            phone_primary="+251911777888",
            license_number="DRV-LIC-42",
            is_active=True,
        )
        db.add(driver)
        db.commit()
        agreement.driver_id = driver.id
        agreement.agreement_type = AgreementType.CUSTOMER_VEHICLE_DRIVER
        db.commit()

        body = read(printing_service.generate_agreement_document(db, agreement.id)["filepath"])

        assert "Kebede Alemu" in body, "driver missing from the agreement"
        assert "DRV-LIC-42" in body
