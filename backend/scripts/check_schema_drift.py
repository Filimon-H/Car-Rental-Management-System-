"""Assert the migrated schema matches the models exactly.

A fresh deploy only ever runs migrations, so the chain must build the same schema
the models describe. Run this after `alembic upgrade head` on an empty database.

Exits non-zero and prints every difference when the two disagree.
"""

import sys
from pathlib import Path

# Runnable as `python scripts/check_schema_drift.py` from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect  # noqa: E402

import src.models  # noqa: F401,E402  — registers every model on the metadata
from src.core.db import Base, engine  # noqa: E402


def main() -> int:
    inspector = inspect(engine)
    db_tables = {t for t in inspector.get_table_names() if t != "alembic_version"}
    model_tables = set(Base.metadata.tables)

    problems: list[str] = []

    missing = model_tables - db_tables
    if missing:
        problems.append(f"tables missing from migrations: {sorted(missing)}")

    orphaned = db_tables - model_tables
    if orphaned:
        problems.append(f"tables with no model: {sorted(orphaned)}")

    for table in sorted(model_tables & db_tables):
        db_cols = {c["name"] for c in inspector.get_columns(table)}
        model_cols = {c.name for c in Base.metadata.tables[table].columns}
        if model_cols - db_cols:
            problems.append(f"{table}: columns missing from migrations {sorted(model_cols - db_cols)}")
        if db_cols - model_cols:
            problems.append(f"{table}: columns with no model field {sorted(db_cols - model_cols)}")

    if problems:
        print("Schema drift between models and migrations:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"Schema matches models: {len(db_tables)} tables, no drift.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
