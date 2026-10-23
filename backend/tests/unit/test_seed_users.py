"""The staff seed must not ship or re-apply known passwords.

It hardcoded "Admin@1234" and friends in git and re-applied them to existing
users on every run, so seeding a live database silently reset the admin
password to a value anyone with the repo could read.
"""
import pathlib

from sqlalchemy.orm import Session

import seed_users
from src.core.security import verify_password
from src.models.staff_user import StaffUser

SOURCE = pathlib.Path(seed_users.__file__).read_text()


def test_no_password_is_hardcoded():
    for leaked in ("Admin@1234", "Sales@1234", "Fleet@1234", "Inspect@1234", "Account@1234"):
        assert leaked not in SOURCE, f"{leaked} is still in the seed script"


def test_missing_users_are_created_with_random_passwords(db: Session, monkeypatch):
    for u in seed_users.USERS:
        monkeypatch.delenv(f"SEED_PASSWORD_{u['username'].upper()}", raising=False)

    issued = seed_users.seed(db)

    assert {u for u, _, _ in issued} == {u["username"] for u in seed_users.USERS}
    passwords = [p for _, _, p in issued]
    assert len(set(passwords)) == len(passwords), "accounts share a password"
    assert all(len(p) >= 12 for p in passwords)


def test_existing_users_are_left_alone_without_reset(db: Session):
    first = dict((u, p) for u, _, p in seed_users.seed(db))

    second = seed_users.seed(db)

    assert second == [], "a plain re-run changed passwords"
    admin = db.query(StaffUser).filter(StaffUser.username == "admin").one()
    assert verify_password(first["admin"], admin.hashed_password)


def test_reset_is_explicit(db: Session):
    seed_users.seed(db)
    admin = db.query(StaffUser).filter(StaffUser.username == "admin").one()
    old_version = admin.token_version

    issued = dict((u, p) for u, _, p in seed_users.seed(db, reset=True))

    db.refresh(admin)
    assert verify_password(issued["admin"], admin.hashed_password)
    assert admin.token_version == old_version + 1, "old sessions were not invalidated"


def test_an_env_password_is_honoured(db: Session, monkeypatch):
    monkeypatch.setenv("SEED_PASSWORD_ADMIN", "local-dev-only-pw")

    issued = dict((u, p) for u, _, p in seed_users.seed(db))

    assert issued["admin"] == "local-dev-only-pw"
