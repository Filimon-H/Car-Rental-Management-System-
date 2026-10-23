"""A blank optional email must save as null, not fail validation.

HTML forms submit an untouched optional input as "", not null. Every schema
here declared the field as Optional[EmailStr], so "" was validated as an
address and rejected with "An email address must have an @-sign" — blocking
the whole save over a field the user deliberately left empty.
"""
import pytest
from pydantic import ValidationError

from src.schemas.collateral_person import CollateralPersonCreate
from src.schemas.customer import CustomerCreate
from src.schemas.driver import DriverCreate
from src.schemas.vendor import VendorCreate

CUSTOMER = dict(
    first_name="Abebe",
    last_name="Bekele",
    phone_primary="0911223399",
    id_type="national_id",
    id_number="QA-NID-5501",
)
VENDOR = dict(company_name="QA Test Vendor", phone_primary="+251911000001")
DRIVER = dict(first_name="Abebe", last_name="Bekele", phone_primary="0911223399", license_number="QA-DL-7701")
COLLATERAL = dict(
    customer_id=1,
    first_name="Abebe",
    last_name="Bekele",
    phone_primary="0911223399",
    id_type="national_id",
    id_number="QA-NID-5502",
)

BLANKS = ["", "   ", "\t", "\n"]


def build(model, base, **overrides):
    return model(**{**base, **overrides})


@pytest.mark.parametrize(
    "model, base",
    [
        (CustomerCreate, CUSTOMER),
        (VendorCreate, VENDOR),
        (DriverCreate, DRIVER),
        (CollateralPersonCreate, COLLATERAL),
    ],
)
class TestBlankEmailIsAccepted:
    @pytest.mark.parametrize("blank", BLANKS)
    def test_blank_becomes_none(self, model, base, blank):
        assert build(model, base, email=blank).email is None

    def test_omitted_stays_none(self, model, base):
        assert build(model, base).email is None

    def test_explicit_null_stays_none(self, model, base):
        assert build(model, base, email=None).email is None

    def test_a_real_address_is_preserved(self, model, base):
        assert build(model, base, email="abebe@example.com").email == "abebe@example.com"

    @pytest.mark.parametrize("bad", ["abc", "a@", "@b.com", "no spaces@x.com"])
    def test_malformed_is_still_rejected(self, model, base, bad):
        # Accepting "" must not become accepting anything.
        with pytest.raises(ValidationError):
            build(model, base, email=bad)


class TestUpdateSchemasToo:
    """The edit forms post the same empty strings as the create forms."""

    def test_customer_update_accepts_blank(self):
        from src.schemas.customer import CustomerUpdate

        assert CustomerUpdate(email="").email is None

    def test_vendor_update_accepts_blank(self):
        from src.schemas.vendor import VendorUpdate

        assert VendorUpdate(email="").email is None

    def test_driver_update_accepts_blank(self):
        from src.schemas.driver import DriverUpdate

        assert DriverUpdate(email="").email is None

    def test_customer_update_still_rejects_malformed(self):
        from src.schemas.customer import CustomerUpdate

        with pytest.raises(ValidationError):
            CustomerUpdate(email="abc")
