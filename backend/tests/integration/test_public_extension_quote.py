"""The price a customer is quoted must be the price they are charged.

The extension quote priced extra days at the flat daily rate while the
booking quote and the admin-side charge posting both applied tiered
weekly/monthly pricing. A customer booking 3 days then extending by 4 was
shown 3,300 + 4,400 = 7,700 ETB and charged 6,500 — the weekly tier.

It also had no status guard, so it would quote an extension on a rental that
had already been cancelled or closed.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from src.models.agreement import AgreementStatus
from src.models.vehicle import Vehicle, VehicleStatus, VehicleType
from src.models.vendor import Vendor
from src.services import agreement_service

from tests.integration.test_extend_booking import (  # noqa: F401
    customer,
    customer_headers,
    customer_user,
)


@pytest.fixture
def tiered_vehicle(db: Session, vendor: Vendor) -> Vehicle:
    """Rates matching the vehicle QA tested: daily 1100, weekly 6500."""
    v = Vehicle(
        vendor_id=vendor.id,
        plate_number="EXT-1100",
        plate_code="01",
        plate_city="AA",
        make="Toyota",
        model="Yaris",
        year=2024,
        color="White",
        vehicle_type=VehicleType.SEDAN,
        service_type="business",
        daily_rate=Decimal("1100.00"),
        weekly_rate=Decimal("6500.00"),
        monthly_rate=Decimal("24000.00"),
        status=VehicleStatus.AVAILABLE,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def quote_booking(client, headers, vehicle_id, pickup, ret) -> dict:
    r = client.post(
        "/api/public/quotes",
        json={
            "vehicle_id": vehicle_id,
            "pickup_datetime": pickup.isoformat(),
            "expected_return_datetime": ret.isoformat(),
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


class TestQuotedPriceMatchesChargedPrice:
    def test_extending_is_priced_with_the_same_tiers_as_booking(
        self, client, db: Session, customer_headers, customer, tiered_vehicle
    ):
        """The headline bug: 3 days + 4 days must cost what 7 days costs."""
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        first_return = pickup + timedelta(days=3)
        new_return = pickup + timedelta(days=7)

        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=first_return,
            daily_rate=tiered_vehicle.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        original = quote_booking(
            client, customer_headers, tiered_vehicle.id, pickup, first_return
        )
        whole = quote_booking(
            client, customer_headers, tiered_vehicle.id, pickup, new_return
        )

        r = client.post(
            f"/api/public/bookings/{agreement.id}/extension-quote",
            json={"new_return_datetime": new_return.isoformat()},
            headers=customer_headers,
        )
        assert r.status_code == 200, r.text
        extension = r.json()

        # What the customer has been shown in total must equal the price of
        # the whole rental they will actually be charged for.
        shown = Decimal(original["total"]) + Decimal(extension["total"])
        assert shown == Decimal(whole["total"]), (
            f"customer shown {shown} for a rental charged {whole['total']}"
        )

    def test_a_long_extension_never_costs_more_than_booking_it_outright(
        self, client, db: Session, customer_headers, customer, tiered_vehicle
    ):
        """QA's evidence: 2 months booked = 50,000; extended into = 55,000."""
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        first_return = pickup + timedelta(days=7)
        new_return = pickup + timedelta(days=57)

        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=first_return,
            daily_rate=tiered_vehicle.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        whole = quote_booking(
            client, customer_headers, tiered_vehicle.id, pickup, new_return
        )
        r = client.post(
            f"/api/public/bookings/{agreement.id}/extension-quote",
            json={"new_return_datetime": new_return.isoformat()},
            headers=customer_headers,
        )
        assert r.status_code == 200, r.text

        assert Decimal(r.json()["total"]) < Decimal(whole["total"]), (
            "extending cost more than the entire rental"
        )

    def test_the_tier_note_is_surfaced(
        self, client, db: Session, customer_headers, customer, tiered_vehicle
    ):
        """The booking page explains the tier; the extend step must too."""
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=2),
            daily_rate=tiered_vehicle.daily_rate,
        )
        agreement.status = AgreementStatus.BOOKING_REQUESTED
        db.commit()

        r = client.post(
            f"/api/public/bookings/{agreement.id}/extension-quote",
            json={"new_return_datetime": (pickup + timedelta(days=30)).isoformat()},
            headers=customer_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("pricing_note"), "no tier explanation returned"


class TestQuoteRefusesWhatExtendWouldRefuse:
    @pytest.mark.parametrize(
        "status", [AgreementStatus.CANCELLED, AgreementStatus.CLOSED]
    )
    def test_a_finished_booking_is_not_quotable(
        self,
        client,
        db: Session,
        customer_headers,
        customer,
        tiered_vehicle,
        status,
    ):
        """It quoted 930,000 ETB to extend a rental that ended in June."""
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=pickup + timedelta(days=3),
            daily_rate=tiered_vehicle.daily_rate,
        )
        agreement.status = status
        db.commit()

        quote = client.post(
            f"/api/public/bookings/{agreement.id}/extension-quote",
            json={"new_return_datetime": (pickup + timedelta(days=10)).isoformat()},
            headers=customer_headers,
        )
        extend = client.post(
            f"/api/public/bookings/{agreement.id}/extend",
            json={"new_return_datetime": (pickup + timedelta(days=10)).isoformat()},
            headers=customer_headers,
        )
        assert extend.status_code == 400, extend.text
        assert quote.status_code == 400, (
            f"quote allowed what extend refused: {quote.text}"
        )


class TestThePostedChargeMatchesTheQuote:
    """The quote is only half the promise; the ledger has to agree with it.

    The extend handler posted its charge with calculate_rental_charge and no
    tier arguments, so fixing the quote alone would still have billed the
    customer the flat daily amount they were no longer quoted.
    """

    def test_an_approved_booking_is_charged_what_it_was_quoted(
        self, client, db: Session, customer_headers, customer, tiered_vehicle
    ):
        from src.services import ledger_service

        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        first_return = pickup + timedelta(days=3)
        new_return = pickup + timedelta(days=7)

        agreement = agreement_service.create_standard_agreement(
            db=db,
            customer_id=customer.id,
            vehicle_id=tiered_vehicle.id,
            pickup_datetime=pickup,
            expected_return_datetime=first_return,
            daily_rate=tiered_vehicle.daily_rate,
        )
        agreement.status = AgreementStatus.PENDING_PAYMENT
        db.commit()

        quoted = client.post(
            f"/api/public/bookings/{agreement.id}/extension-quote",
            json={"new_return_datetime": new_return.isoformat()},
            headers=customer_headers,
        )
        assert quoted.status_code == 200, quoted.text
        quoted_total = Decimal(quoted.json()["total"])

        before = ledger_service.get_total_charges(db, agreement.id)
        extended = client.post(
            f"/api/public/bookings/{agreement.id}/extend",
            json={"new_return_datetime": new_return.isoformat()},
            headers=customer_headers,
        )
        assert extended.status_code == 200, extended.text
        posted = ledger_service.get_total_charges(db, agreement.id) - before

        assert posted == quoted_total, (
            f"quoted {quoted_total} but posted {posted} to the ledger"
        )


class TestOverlapRulesAreConsistent:
    """Creation allows overlapping requests; extension must not punish them.

    A customer could book the same vehicle twice over the same dates with no
    warning, then be refused an extension because of the request the system
    had just let them create — with an error naming neither booking.
    """

    def _request(self, client, headers, vehicle, pickup, ret):
        """Create through the public endpoint, which is what allows overlap.

        create_standard_agreement enforces availability; POST /api/public/
        bookings builds the Agreement directly and does not. That asymmetry
        is the bug, so the fixture has to go through the public path.
        """
        r = client.post(
            "/api/public/bookings",
            json={
                "vehicle_id": vehicle.id,
                "pickup_datetime": pickup.isoformat(),
                "expected_return_datetime": ret.isoformat(),
            },
            headers=headers,
        )
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_an_unapproved_request_does_not_block_an_extension(
        self, client, db: Session, customer_headers, customer, tiered_vehicle
    ):
        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        # The blocking request QA created: same vehicle, overlapping span.
        self._request(
            client, customer_headers, tiered_vehicle, pickup, pickup + timedelta(days=10)
        )
        mine = self._request(
            client, customer_headers, tiered_vehicle,
            pickup + timedelta(days=4), pickup + timedelta(days=7),
        )

        r = client.post(
            f"/api/public/bookings/{mine['id']}/extend",
            json={"new_return_datetime": (pickup + timedelta(days=11)).isoformat()},
            headers=customer_headers,
        )
        assert r.status_code == 200, (
            f"blocked by a request the system allowed: {r.text}"
        )

    def test_an_approved_booking_still_blocks_and_names_itself(
        self, client, db: Session, customer_headers, customer, tiered_vehicle
    ):
        """A real hold must still block — and say which one."""
        from src.models.agreement import Agreement

        pickup = datetime.now().replace(microsecond=0) + timedelta(days=11)
        created = self._request(
            client, customer_headers, tiered_vehicle,
            pickup + timedelta(days=8), pickup + timedelta(days=14),
        )
        blocker = db.query(Agreement).filter(Agreement.id == created["id"]).one()
        blocker.status = AgreementStatus.PENDING_PAYMENT
        db.commit()

        mine = self._request(
            client, customer_headers, tiered_vehicle, pickup, pickup + timedelta(days=3)
        )

        r = client.post(
            f"/api/public/bookings/{mine['id']}/extend",
            json={"new_return_datetime": (pickup + timedelta(days=10)).isoformat()},
            headers=customer_headers,
        )
        assert r.status_code == 400, r.text
        assert blocker.agreement_number in r.json()["detail"], (
            f"error does not name the blocking agreement: {r.json()['detail']}"
        )
