"""A customer record must carry a usable phone number.

Phone is the de-facto identity key: /customer and the admin search look it
up, and the duplicate guard keys on it. The API accepted "notaphone" — it
is nine characters, which was the only check — leaving a record nobody can
find and the duplicate guard cannot see.
"""
import pytest

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
)


def create(client, headers, phone: str):
    return client.post(
        "/api/customers",
        json={
            "business_type": "individual",
            "first_name": "Phone",
            "last_name": "Check",
            "phone_primary": phone,
            "id_type": "national_id",
            "id_number": f"PH-{abs(hash(phone)) % 100000}",
        },
        headers=headers,
    )


class TestMalformedPhonesAreRefused:
    @pytest.mark.parametrize(
        "junk", ["notaphone", "abcdefghij", "0912345", "+1 555 0100", "999999999999"]
    )
    def test_the_api_refuses_it(self, client, auth_headers, junk):
        response = create(client, auth_headers, junk)
        assert response.status_code == 422, (
            f"accepted {junk!r}: {response.text}"
        )


class TestValidPhonesAreStoredCanonically:
    @pytest.mark.parametrize(
        "given", ["0923677111", "+251923677111", "251923677111", "923677111"]
    )
    def test_every_accepted_format_normalises(self, client, auth_headers, given):
        response = create(client, auth_headers, given)
        assert response.status_code in (200, 201), response.text
        assert response.json()["phone_primary"] == "+251923677111", response.text
