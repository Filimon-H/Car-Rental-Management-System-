"""Merging duplicate customer records.

The same person existed three times (staff-entered, then two online
signups), with their rentals split across the records and one login on each.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from src.core.db import Base
from src.core.errors import BusinessError
from src.models.agreement import Agreement, AgreementStatus, AgreementType
from src.models.audit_event import AuditEvent
from src.models.collateral_person import CollateralPerson
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink
from src.services.customer_merge_service import REASSIGNED, merge_customers


def _customer(db, **kw) -> Customer:
    c = Customer(
        first_name=kw.pop("first_name", "Filimon"),
        last_name=kw.pop("last_name", "Haylemariyam"),
        phone_primary=kw.pop("phone_primary", "+251923677823"),
        business_type="individual",
        is_active=True,
        **kw,
    )
    db.add(c)
    db.commit()
    return c


def _agreement(db, customer, number) -> Agreement:
    now = datetime.now(timezone.utc)
    a = Agreement(
        agreement_number=number,
        agreement_type=AgreementType.CUSTOMER_VEHICLE,
        status=AgreementStatus.CLOSED,
        customer_id=customer.id,
        pickup_datetime=now,
        expected_return_datetime=now + timedelta(days=2),
        agreed_daily_rate=Decimal("1500"),
        deposit_amount=Decimal("0"),
    )
    db.add(a)
    db.commit()
    return a


def _login(db, customer, email) -> CustomerUser:
    u = CustomerUser(customer_id=customer.id, email=email, hashed_password="x", token_version=0, is_active=True)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def family(db):
    keep = _customer(db, email="filimon@gmail.com", id_type="passport", id_number="2233",
                     license_number="2333", subcity="Gullele", city="Addis Ababa")
    first_signup = _customer(db, first_name="filimon", last_name="Hailemariam", email="filimon2014@gmail.com")
    second_signup = _customer(
        db, first_name="filimon", last_name="Hailemariam", email="filimon20@gmail.com",
        id_type="national_id", id_number="1234865", id_expiry=datetime(2028, 5, 29),
        license_number="1234564", license_expiry=datetime(2028, 5, 31),
        emergency_contact_name="Nardos", emergency_contact_phone="+251910029713",
    )
    _agreement(db, keep, "AGR-K-1")
    _agreement(db, second_signup, "AGR-D-1")
    _agreement(db, second_signup, "AGR-D-2")
    db.add(CollateralPerson(customer_id=second_signup.id, first_name="Almaz", last_name="B",
                            phone_primary="+251911000001", id_type="national_id", id_number="C-1", is_active=True))
    db.commit()
    stale = _login(db, first_signup, "filimon2014@gmail.com")
    used = _login(db, second_signup, "filimon20@gmail.com")
    db.add(TelegramCustomerLink(customer_user_id=used.id, telegram_user_id=339068667, chat_id=339068667))
    db.commit()
    return keep, first_signup, second_signup, stale, used


def test_every_customer_foreign_key_is_reassigned():
    referencing = {
        table.name
        for table in Base.metadata.tables.values()
        for fk in table.foreign_keys
        if fk.column.table.name == "customers"
    }
    # customer_users has a unique customer_id and is handled on its own.
    assert referencing - {"customer_users"} == {m.__tablename__ for m in REASSIGNED}


def test_rentals_and_collateral_move_to_the_kept_record(db, family):
    keep, first_signup, second_signup, *_ = family
    summary = merge_customers(db, keep.id, [first_signup.id, second_signup.id])

    numbers = {a.agreement_number for a in db.query(Agreement).filter_by(customer_id=keep.id)}
    assert numbers == {"AGR-K-1", "AGR-D-1", "AGR-D-2"}
    assert db.query(CollateralPerson).filter_by(customer_id=keep.id).count() == 1
    assert summary["moved"]["agreements"] == 2


def test_the_most_complete_identity_document_wins_as_a_set(db, family):
    keep, first_signup, second_signup, *_ = family
    merge_customers(db, keep.id, [first_signup.id, second_signup.id])
    db.refresh(keep)

    # ID number and its expiry come from the same record, never mixed.
    assert (keep.id_type, keep.id_number) == ("national_id", "1234865")
    assert keep.id_expiry.date().isoformat() == "2028-05-29"
    assert (keep.license_number, keep.license_expiry.date().isoformat()) == ("1234564", "2028-05-31")
    # The replaced details are kept in the notes.
    assert "id_number=2233" in keep.notes and "license_number=2333" in keep.notes


def test_the_kept_record_keeps_its_own_details_and_gains_missing_ones(db, family):
    keep, first_signup, second_signup, *_ = family
    merge_customers(db, keep.id, [first_signup.id, second_signup.id])
    db.refresh(keep)

    assert (keep.first_name, keep.last_name, keep.email) == ("Filimon", "Haylemariyam", "filimon@gmail.com")
    assert (keep.subcity, keep.city) == ("Gullele", "Addis Ababa")
    assert keep.emergency_contact_name == "Nardos"


def test_the_telegram_linked_login_is_kept_and_the_other_switched_off(db, family):
    keep, first_signup, second_signup, stale, used = family
    merge_customers(db, keep.id, [first_signup.id, second_signup.id])
    db.refresh(stale)
    db.refresh(used)

    assert used.customer_id == keep.id and used.is_active
    # The spare login can no longer sign in, and any session it had is void.
    assert not stale.is_active and stale.token_version == 1
    assert db.query(TelegramCustomerLink).filter_by(customer_user_id=used.id).count() == 1


def test_duplicates_are_retired_not_deleted(db, family):
    keep, first_signup, second_signup, *_ = family
    merge_customers(db, keep.id, [first_signup.id, second_signup.id])

    for dup in (first_signup, second_signup):
        db.refresh(dup)
        assert not dup.is_active
        assert f"Merged into customer #{keep.id}" in dup.notes
    event = db.query(AuditEvent).filter_by(entity_type="customer", entity_id=keep.id).one()
    assert event.details["merge"]["merged"] == [first_signup.id, second_signup.id]


def test_merging_a_record_into_itself_is_refused(db, family):
    keep, *_ = family
    with pytest.raises(BusinessError):
        merge_customers(db, keep.id, [keep.id])


def test_a_failed_merge_writes_nothing(db, family):
    keep, first_signup, *_ = family
    with pytest.raises(Exception):
        merge_customers(db, keep.id, [first_signup.id, 999_999])
    assert db.query(Agreement).filter_by(customer_id=keep.id).count() == 1
    db.refresh(first_signup)
    assert first_signup.is_active
