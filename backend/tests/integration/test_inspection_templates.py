"""Inspection templates were read-only: only GET existed, so the list could
never be anything but empty and the Template dropdown was permanently blank.
"""
import pytest
from sqlalchemy.orm import Session

from src.core.rbac import Role
from src.core.security import hash_password
from src.models.inspection_template import InspectionTemplate
from src.models.staff_user import StaffUser


@pytest.fixture
def inspector(db: Session) -> StaffUser:
    user = StaffUser(
        username="inspectoruser",
        email="inspector@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Inspector User",
        role=Role.INSPECTOR,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, inspector) -> dict:
    r = client.post(
        "/api/auth/login", json={"username": "inspectoruser", "password": "testpass123"}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


PAYLOAD = {
    "name": "Standard pickup",
    "description": "Checks before handover",
    "template_type": "pickup",
    "checklist_items": [
        {"id": "exterior_front", "label": "Front exterior", "category": "exterior", "required": True},
        {"id": "tyres", "label": "Tyres", "category": "exterior", "required": True},
    ],
    "damage_categories": ["scratch", "dent", "crack"],
}


class TestCreate:
    def test_a_template_can_be_created(self, client, auth_headers):
        r = client.post("/api/inspections/templates", headers=auth_headers, json=PAYLOAD)
        assert r.status_code == 201, r.text

        body = r.json()
        assert body["name"] == "Standard pickup"
        assert len(body["checklist_items"]) == 2
        assert body["damage_categories"] == ["scratch", "dent", "crack"]
        assert body["is_active"] is True

    def test_it_then_appears_in_the_list(self, client, auth_headers):
        client.post("/api/inspections/templates", headers=auth_headers, json=PAYLOAD)

        listed = client.get("/api/inspections/templates", headers=auth_headers).json()
        assert [t["name"] for t in listed] == ["Standard pickup"]

    def test_a_blank_name_is_rejected(self, client, auth_headers):
        r = client.post(
            "/api/inspections/templates", headers=auth_headers, json={**PAYLOAD, "name": ""}
        )
        assert r.status_code == 422


class TestUpdate:
    def test_checklist_items_can_be_replaced(self, client, db: Session, auth_headers):
        created = client.post(
            "/api/inspections/templates", headers=auth_headers, json=PAYLOAD
        ).json()

        r = client.put(
            f"/api/inspections/templates/{created['id']}",
            headers=auth_headers,
            json={"checklist_items": [{"id": "lights", "label": "Lights", "required": False}]},
        )
        assert r.status_code == 200, r.text
        assert [i["id"] for i in r.json()["checklist_items"]] == ["lights"]

    def test_fields_left_out_are_untouched(self, client, auth_headers):
        created = client.post(
            "/api/inspections/templates", headers=auth_headers, json=PAYLOAD
        ).json()

        r = client.put(
            f"/api/inspections/templates/{created['id']}",
            headers=auth_headers,
            json={"description": "Revised"},
        )
        assert r.json()["name"] == "Standard pickup"
        assert len(r.json()["checklist_items"]) == 2

    def test_updating_a_missing_template_is_404(self, client, auth_headers):
        r = client.put(
            "/api/inspections/templates/999999", headers=auth_headers, json={"name": "X"}
        )
        assert r.status_code == 404


class TestDelete:
    def test_it_deactivates_rather_than_removing(self, client, db: Session, auth_headers):
        created = client.post(
            "/api/inspections/templates", headers=auth_headers, json=PAYLOAD
        ).json()

        assert (
            client.delete(
                f"/api/inspections/templates/{created['id']}", headers=auth_headers
            ).status_code
            == 204
        )

        # The row survives, so inspections taken from it keep their reference.
        row = (
            db.query(InspectionTemplate)
            .filter(InspectionTemplate.id == created["id"])
            .one()
        )
        assert row.is_active is False

        listed = client.get("/api/inspections/templates", headers=auth_headers).json()
        assert created["id"] not in [t["id"] for t in listed]


class TestChecklistShape:
    def test_structured_items_round_trip(self, client, auth_headers):
        r = client.post("/api/inspections/templates", headers=auth_headers, json=PAYLOAD)
        item = r.json()["checklist_items"][0]
        assert item == {
            "id": "exterior_front",
            "label": "Front exterior",
            "category": "exterior",
            "required": True,
        }

    def test_a_plain_string_list_is_promoted_on_read(self, client, db: Session, auth_headers):
        """Rows stored before the shape was enforced must stay readable."""
        legacy = InspectionTemplate(
            name="Legacy",
            template_type="pickup",
            checklist_items=["Exterior body", "Spare wheel"],
            damage_categories=["Scratch"],
            is_active=True,
        )
        db.add(legacy)
        db.commit()
        db.refresh(legacy)

        r = client.get(f"/api/inspections/templates/{legacy.id}", headers=auth_headers)
        assert r.status_code == 200, r.text

        items = r.json()["checklist_items"]
        assert items[0]["label"] == "Exterior body"
        assert items[0]["id"] == "exterior_body"
        assert items[0]["category"] == "general"

    def test_an_item_without_a_label_is_rejected(self, client, auth_headers):
        r = client.post(
            "/api/inspections/templates",
            headers=auth_headers,
            json={**PAYLOAD, "checklist_items": [{"id": "x"}]},
        )
        assert r.status_code == 422

    def test_category_defaults_when_omitted(self, client, auth_headers):
        r = client.post(
            "/api/inspections/templates",
            headers=auth_headers,
            json={**PAYLOAD, "checklist_items": [{"id": "lights", "label": "Lights"}]},
        )
        assert r.json()["checklist_items"][0]["category"] == "general"
