"""Editing a customer keeps their ID expiry and driving licence.

The API names these id_expiry_date, driver_license_number and
driver_license_expiry; the columns are id_expiry, license_number and
license_expiry. Create mapped the names, but update copied each field onto
the record by its API name, so the three values were set on attributes that
are not columns: the response looked fine and nothing was saved.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.customer import Customer
from src.models.staff_user import StaffUser


def _create(client: TestClient, headers: dict, **fields) -> dict:
    r = client.post("/api/customers", headers=headers, json={
        "first_name": "Hana", "last_name": "Girma", "business_type": "individual",
        "id_type": "national_id", "id_number": f"NID-{fields['phone_primary']}", **fields,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def _headers(client: TestClient, db: Session) -> dict:
    db.add(StaffUser(username="edit_admin", email="edit@nod.et", full_name="Edit Admin",
                     hashed_password=hash_password("testpass123"), role=Role.ADMIN, is_active=True))
    db.commit()
    r = client.post("/api/auth/login", json={"username": "edit_admin", "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_editing_saves_id_expiry_and_licence(client: TestClient, db: Session):
    headers = _headers(client, db)
    created = _create(client, headers, phone_primary="0911555123")

    r = client.put(f"/api/customers/{created['id']}", headers=headers, json={
        "id_expiry_date": "2029-03-01T00:00:00",
        "driver_license_number": "DL-445566",
        "driver_license_expiry": "2030-07-15T00:00:00",
    })
    assert r.status_code == 200

    db.expire_all()
    stored = db.get(Customer, created["id"])
    assert stored.license_number == "DL-445566"
    assert stored.id_expiry.date().isoformat() == "2029-03-01"
    assert stored.license_expiry.date().isoformat() == "2030-07-15"

    again = client.get(f"/api/customers/{created['id']}", headers=headers).json()
    assert again["driver_license_number"] == "DL-445566"
    assert again["id_expiry_date"].startswith("2029-03-01")
    assert again["driver_license_expiry"].startswith("2030-07-15")


def test_editing_other_fields_leaves_the_licence_alone(client: TestClient, db: Session):
    headers = _headers(client, db)
    created = _create(client, headers, phone_primary="0911555124", driver_license_number="DL-1")
    client.put(f"/api/customers/{created['id']}", headers=headers, json={"city": "Adama"})

    db.expire_all()
    stored = db.get(Customer, created["id"])
    assert (stored.city, stored.license_number) == ("Adama", "DL-1")
