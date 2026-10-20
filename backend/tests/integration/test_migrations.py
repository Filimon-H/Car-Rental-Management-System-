"""A database built from the migrations must work, not just one built by create_all.

The tests build their schema with Base.metadata.create_all, so a migration
could declare something SQLite rejects at insert time and every test would
still pass. Five did: server_default=text("now()"), a function SQLite does
not have. A fresh install made with `alembic upgrade head` then failed the
first customer signup.
"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]


def _upgrade(db_file: Path) -> None:
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_file}"}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
        check=True,
        capture_output=True,
    )


def test_migrated_schema_has_no_postgres_only_defaults(tmp_path):
    db_file = tmp_path / "migrated.db"
    _upgrade(db_file)

    with sqlite3.connect(db_file) as conn:
        offenders = [
            name
            for name, sql in conn.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table'")
            if sql and "now()" in sql.lower()
        ]
    assert offenders == []


def test_migrated_schema_accepts_a_customer_signup_row(tmp_path):
    db_file = tmp_path / "migrated.db"
    _upgrade(db_file)

    with sqlite3.connect(db_file) as conn:
        conn.execute(
            "INSERT INTO customers (first_name, last_name, phone_primary, business_type, is_active)"
            " VALUES ('Abebe', 'Kebede', '+251911000000', 'individual', 1)"
        )
        customer_id = conn.execute("SELECT id FROM customers").fetchone()[0]
        # created_at and updated_at left to their server defaults, as the
        # signup endpoint does.
        conn.execute(
            "INSERT INTO customer_users (customer_id, email, hashed_password, token_version, is_active)"
            " VALUES (?, 'abebe@example.com', 'x', 0, 1)",
            (customer_id,),
        )
        created_at, updated_at = conn.execute("SELECT created_at, updated_at FROM customer_users").fetchone()
    assert created_at and updated_at
