"""Database engine and session configuration."""

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from datetime import timezone

from sqlalchemy import DateTime, TypeDecorator, create_engine, event
from sqlalchemy.orm import Session, sessionmaker, declarative_base

from src.core.config import settings

# Configure engine based on database type
_connect_args = {}
_engine_kwargs = {
    "echo": settings.sql_echo,
}

if settings.database_url.startswith("sqlite"):
    # SQLite-specific settings
    _connect_args["check_same_thread"] = False
else:
    # PostgreSQL/other settings
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    **_engine_kwargs,
)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, connection_record):  # noqa: ANN001
        """Apply per-connection SQLite pragmas.

        SQLite defaults to foreign_keys=OFF, which makes every ForeignKey in the
        models decorative — an orphan row (e.g. a ledger entry pointing at a
        non-existent agreement) would be accepted silently. These must be set on
        every connection; they do not persist in the database file.

        WAL additionally lets readers run while a write is in progress, instead of
        the default journal where a writer blocks the whole database.
        """
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=10000")
        finally:
            cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class UtcDateTime(TypeDecorator):
    """A DateTime that always reads back timezone-aware, in UTC.

    SQLite has no native timestamp type, so DateTime(timezone=True) columns
    return naive values even though they were written in UTC. Pydantic then
    serialises them without an offset ("2026-09-24T08:38:00") and a browser
    reads that as local time — a payment taken at 11:38 in Africa/Addis_Ababa
    displayed as 08:38 in the ledger, while an inspection, whose timestamp is
    set in application code and stays aware, displayed correctly.

    Tagging on read fixes every response at once and changes no stored data.
    """

    impl = DateTime
    cache_ok = True

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("timezone", True)
        super().__init__(*args, **kwargs)

    def process_result_value(self, value, dialect):  # noqa: ANN001
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]
