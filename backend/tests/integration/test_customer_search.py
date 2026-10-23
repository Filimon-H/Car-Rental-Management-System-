"""Customer-list search regression tests."""

import pytest

from tests.integration.test_agreements_standard import auth_headers, sales_user  # noqa: F401
from src.models.customer import Customer


@pytest.fixture
def searchable_customer(db):
    customer = Customer(
        first_name="Abebe",
        last_name="Bekele",
        phone_primary="0911223344",
        id_type="national_id",
        id_number="AB-SEARCH-24",
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@pytest.mark.parametrize(
    "term",
    ["Abebe", "Bekele", "Abebe Bekele", "Bekele Abebe", "abebe bek", "0911223344", "AB-SEARCH-24"],
)
def test_customer_list_search_matches_names_phone_and_id(
    client, auth_headers, searchable_customer, term
):
    response = client.get("/api/customers", params={"search": term}, headers=auth_headers)

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [searchable_customer.id]


def test_customer_list_search_requires_every_word(client, auth_headers, searchable_customer):
    response = client.get(
        "/api/customers", params={"search": "Abebe missing"}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json()["items"] == []


# The lookup modal has its own endpoint, and it is the picker used when
# creating an agreement — a full name has to resolve here too, or a booking
# cannot be started by typing the customer's name.
@pytest.mark.parametrize(
    "term",
    ["Abebe", "Bekele", "Abebe Bekele", "Bekele Abebe", "abebe bek", "0911223344", "AB-SEARCH-24"],
)
def test_customer_lookup_search_matches_names_phone_and_id(
    client, auth_headers, searchable_customer, term
):
    response = client.get("/api/customers/search", params={"q": term}, headers=auth_headers)

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [searchable_customer.id]


def test_customer_lookup_search_requires_every_word(client, auth_headers, searchable_customer):
    response = client.get(
        "/api/customers/search", params={"q": "Abebe missing"}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json() == []


def test_customer_lookup_search_excludes_inactive(client, auth_headers, db, searchable_customer):
    searchable_customer.is_active = False
    db.commit()

    response = client.get(
        "/api/customers/search", params={"q": "Abebe Bekele"}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json() == []
