"""Shared helpers for migrations.

The base revision creates the schema from the current model metadata, so a column
added by a later revision may already exist on a freshly built database while being
genuinely absent on an older one. These helpers make such steps idempotent so the
same chain works in both directions.
"""

from alembic import op
from sqlalchemy import inspect


def column_exists(table: str, column: str) -> bool:
    inspector = inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def table_exists(table: str) -> bool:
    return table in inspect(op.get_bind()).get_table_names()


def add_column_if_missing(table: str, column) -> None:
    """Add a column only when the table lacks it."""
    if not column_exists(table, column.name):
        op.add_column(table, column)


def drop_column_if_present(table: str, column_name: str) -> None:
    if column_exists(table, column_name):
        op.drop_column(table, column_name)
