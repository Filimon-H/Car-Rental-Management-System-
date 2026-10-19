"""Seed staff users, one account per role.

    python seed_users.py           create any missing accounts
    python seed_users.py --reset   also reset existing accounts' passwords

Passwords used to be hardcoded here, one guessable value per role, committed
to git, and re-applied to *existing* users on every run — so running the seed
against a live database silently reset the admin password to a value anyone
with the repo could read.

Now each password comes from SEED_PASSWORD_<USERNAME> if set (for
reproducible local setups), and is otherwise generated at random and printed
once. Existing accounts are left alone unless --reset is passed.
"""

import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(__file__))

from src.core.rbac import Role

USERS = [
    dict(username="admin",       full_name="System Admin",  email="admin@fleetops.com",      role=Role.ADMIN),
    dict(username="sales1",      full_name="Sara Bekele",   email="sales@fleetops.com",      role=Role.SALES),
    dict(username="fleet1",      full_name="Fitsum Haile",  email="fleet@fleetops.com",      role=Role.FLEET),
    dict(username="inspector1",  full_name="Hana Girma",    email="inspector@fleetops.com",  role=Role.INSPECTOR),
    dict(username="accountant1", full_name="Yonas Tesfaye", email="accountant@fleetops.com", role=Role.ACCOUNTANT),
]


def password_for(username: str) -> str:
    """The configured password for a seed user, or a fresh random one."""
    configured = os.environ.get(f"SEED_PASSWORD_{username.upper()}")
    return configured or secrets.token_urlsafe(12)


def seed(db, reset: bool = False) -> list[tuple[str, str, str]]:
    """Create missing staff users; reset existing ones only if asked.

    Returns (username, role, password) for every account whose password was
    set, so the caller can show it once.
    """
    from src.core.security import hash_password
    from src.models.staff_user import StaffUser

    issued = []
    for u in USERS:
        existing = db.query(StaffUser).filter(StaffUser.username == u["username"]).first()
        if existing and not reset:
            print(f"  kept     {u['username']:15}  role={existing.role.value}  (pass --reset to change)")
            continue

        password = password_for(u["username"])
        if existing:
            existing.hashed_password = hash_password(password)
            existing.is_active = True
            existing.token_version += 1  # invalidate any old sessions
            existing.full_name = u["full_name"]
            existing.email = u["email"]
            existing.role = u["role"]
            print(f"  reset    {u['username']:15}  role={u['role'].value}")
        else:
            db.add(
                StaffUser(
                    username=u["username"],
                    email=u["email"],
                    hashed_password=hash_password(password),
                    full_name=u["full_name"],
                    role=u["role"],
                    is_active=True,
                )
            )
            print(f"  created  {u['username']:15}  role={u['role'].value}")
        issued.append((u["username"], u["role"].value, password))

    db.commit()
    return issued


def main() -> None:
    from src.core.db import SessionLocal

    db = SessionLocal()
    try:
        issued = seed(db, reset="--reset" in sys.argv)
    finally:
        db.close()

    if not issued:
        print("\nNo passwords changed.")
        return
    print("\nStore these now — they are not saved anywhere and will not be shown again.")
    print("━" * 52)
    print("  USERNAME       ROLE         PASSWORD")
    print("━" * 52)
    for username, role, password in issued:
        print(f"  {username:14} {role:12} {password}")
    print("━" * 52)


if __name__ == "__main__":
    main()
