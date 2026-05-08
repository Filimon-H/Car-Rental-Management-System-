"""Seed / reset staff users with one account per role."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from src.core.db import SessionLocal
from src.core.security import hash_password
from src.core.rbac import Role
from src.models.staff_user import StaffUser

USERS = [
    dict(username="admin",     password="Admin@1234",     full_name="System Admin",      email="admin@fleetops.com",     role=Role.ADMIN),
    dict(username="sales1",    password="Sales@1234",     full_name="Sara Bekele",        email="sales@fleetops.com",     role=Role.SALES),
    dict(username="fleet1",    password="Fleet@1234",     full_name="Fitsum Haile",       email="fleet@fleetops.com",     role=Role.FLEET),
    dict(username="inspector1",password="Inspect@1234",   full_name="Hana Girma",         email="inspector@fleetops.com", role=Role.INSPECTOR),
    dict(username="accountant1",password="Account@1234",  full_name="Yonas Tesfaye",      email="accountant@fleetops.com",role=Role.ACCOUNTANT),
]

db = SessionLocal()

for u in USERS:
    existing = db.query(StaffUser).filter(StaffUser.username == u["username"]).first()
    if existing:
        # reset password and make sure active
        existing.hashed_password = hash_password(u["password"])
        existing.is_active = True
        existing.token_version += 1   # invalidate any old sessions
        existing.full_name = u["full_name"]
        existing.email = u["email"]
        existing.role = u["role"]
        print(f"  updated  {u['username']:15}  role={u['role'].value}")
    else:
        new_user = StaffUser(
            username=u["username"],
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            full_name=u["full_name"],
            role=u["role"],
            is_active=True,
        )
        db.add(new_user)
        print(f"  created  {u['username']:15}  role={u['role'].value}")

db.commit()
db.close()

print()
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("  USERNAME       ROLE         PASSWORD")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
for u in USERS:
    print(f"  {u['username']:14} {u['role'].value:12} {u['password']}")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
