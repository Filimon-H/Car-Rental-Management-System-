"""Attaching photos to an inspection.

The inspection_photos table existed but nothing could write to it, so an
inspector recording damage had no way to attach the picture that proves it.
"""
import base64
import pathlib
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.api.routers import inspection_photos
from src.core.rbac import Role
from src.core.security import hash_password
from src.models.inspection import Inspection, InspectionPhoto
from src.models.staff_user import StaffUser

from tests.integration.test_agreements_standard import test_vehicle  # noqa: F401

# A real 1x1 PNG, so content sniffing sees an image.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(inspection_photos, "UPLOAD_DIR", tmp_path / "inspection_photos")
    return tmp_path


def login(client: TestClient, db: Session, username: str, role: Role) -> dict:
    db.add(
        StaffUser(
            username=username,
            email=f"{username}@nod.et",
            full_name=username,
            hashed_password=hash_password("testpass123"),
            role=role,
            is_active=True,
        )
    )
    db.commit()
    r = client.post("/api/auth/login", json={"username": username, "password": "testpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def inspector(client, db):
    return login(client, db, "photo_inspector", Role.INSPECTOR)


@pytest.fixture
def inspection(db: Session, test_vehicle) -> Inspection:
    i = Inspection(
        vehicle_id=test_vehicle.id,
        inspection_type="pickup",
        inspection_datetime=datetime.now(timezone.utc),
        damage_records=[],
        checklist_results={},
        status="draft",
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


def upload(client, headers, inspection_id, content=PNG, name="scratch.png", **form):
    return client.post(
        f"/api/inspections/{inspection_id}/photos",
        files={"file": (name, content, "image/png")},
        data=form,
        headers=headers,
    )


class TestUploading:
    def test_an_inspector_can_attach_a_photo(self, client, db, inspector, inspection):
        r = upload(client, inspector, inspection.id, caption="Front bumper", category="damage")
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["caption"] == "Front bumper"
        assert body["category"] == "damage"
        assert body["mime_type"] == "image/png"

        listed = client.get(f"/api/inspections/{inspection.id}/photos", headers=inspector)
        assert [p["id"] for p in listed.json()] == [body["id"]]

    def test_the_file_is_served_back_to_staff(self, client, db, inspector, inspection):
        photo = upload(client, inspector, inspection.id).json()
        r = client.get(f"/api/inspections/{inspection.id}/photos/{photo['id']}/file", headers=inspector)
        assert r.status_code == 200
        assert r.content == PNG
        assert r.headers["content-type"] == "image/png"

    def test_it_is_stored_outside_the_public_mount(self, client, db, inspector, inspection, isolated_storage):
        """These show customers' cars, often the customers too."""
        upload(client, inspector, inspection.id)
        stored = db.query(InspectionPhoto).one().file_path
        assert pathlib.Path(stored).is_relative_to(isolated_storage)


class TestBadFilesAreRefused:
    def test_a_pdf_renamed_to_png_is_refused(self, client, inspector, inspection):
        r = upload(client, inspector, inspection.id, content=b"%PDF-1.4 fake", name="x.png")
        assert r.status_code == 400

    def test_a_non_image_extension_is_refused(self, client, inspector, inspection):
        r = upload(client, inspector, inspection.id, name="notes.txt")
        assert r.status_code == 400

    def test_an_unknown_category_is_refused(self, client, inspector, inspection):
        r = upload(client, inspector, inspection.id, category="selfie")
        assert r.status_code == 400

    def test_a_filename_cannot_carry_a_path(self, client, db, inspector, inspection):
        r = upload(client, inspector, inspection.id, name="../../etc/evil.png")
        assert r.status_code == 201, r.text
        assert r.json()["filename"] == "evil.png"


class TestASignedInspectionIsLocked:
    def test_no_photo_can_be_added(self, client, db, inspector, inspection):
        inspection.status = "signed"
        db.commit()
        assert upload(client, inspector, inspection.id).status_code == 400

    def test_no_photo_can_be_removed(self, client, db, inspector, inspection):
        photo = upload(client, inspector, inspection.id).json()
        inspection.status = "signed"
        db.commit()
        r = client.delete(f"/api/inspections/{inspection.id}/photos/{photo['id']}", headers=inspector)
        assert r.status_code == 400
        assert db.query(InspectionPhoto).count() == 1

    def test_a_completed_but_unsigned_one_can_still_take_photos(self, client, db, inspector, inspection):
        """Matches the existing edit rule: locked at signing, not at completion."""
        inspection.status = "completed"
        db.commit()
        assert upload(client, inspector, inspection.id).status_code == 201


class TestPermissions:
    def test_fleet_can_view_but_not_upload(self, client, db, inspector, inspection):
        upload(client, inspector, inspection.id)
        fleet = login(client, db, "photo_fleet", Role.FLEET)
        assert client.get(f"/api/inspections/{inspection.id}/photos", headers=fleet).status_code == 200
        assert upload(client, fleet, inspection.id).status_code == 403

    def test_sales_cannot_see_them(self, client, db, inspector, inspection):
        photo = upload(client, inspector, inspection.id).json()
        sales = login(client, db, "photo_sales", Role.SALES)
        r = client.get(f"/api/inspections/{inspection.id}/photos/{photo['id']}/file", headers=sales)
        assert r.status_code == 403

    def test_a_photo_is_not_reachable_through_another_inspection(
        self, client, db, inspector, inspection, test_vehicle
    ):
        photo = upload(client, inspector, inspection.id).json()
        other = Inspection(
            vehicle_id=test_vehicle.id, inspection_type="return",
            inspection_datetime=datetime.now(timezone.utc),
            damage_records=[], checklist_results={}, status="draft",
        )
        db.add(other)
        db.commit()
        r = client.get(f"/api/inspections/{other.id}/photos/{photo['id']}/file", headers=inspector)
        assert r.status_code == 404


class TestDeleting:
    def test_delete_removes_record_and_file(self, client, db, inspector, inspection):
        photo = upload(client, inspector, inspection.id).json()
        stored = pathlib.Path(db.query(InspectionPhoto).one().file_path)
        assert stored.exists()

        r = client.delete(f"/api/inspections/{inspection.id}/photos/{photo['id']}", headers=inspector)

        assert r.status_code == 204
        assert db.query(InspectionPhoto).count() == 0
        assert not stored.exists()
