"""Pytest configuration and fixtures."""

import os
import pytest
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

os.environ["APP_ENV"] = "development"
os.environ["DEBUG"] = "true"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["TELEGRAM_BOT_ENABLED"] = "false"
os.environ["TELEGRAM_BOT_MODE"] = "disabled"

import src.models  # noqa: F401
from src.core.db import Base
from src.core.db import get_db
from src.models.vendor import Vendor


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db() -> Generator[Session, None, None]:
    """Route all app database access to the shared test engine."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def db() -> Generator[Session, None, None]:
    """Create a fresh database session for each test."""
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Drop all tables after each test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def vendor(db: Session) -> Vendor:
    """Create a default vendor for vehicle fixtures."""
    vendor = Vendor(
        vendor_type="company",
        company_name="Test Vendor PLC",
        phone_primary="0911999999",
        is_active=True,
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@pytest.fixture(scope="session")
def app():
    """Create application instance for testing."""
    import src.api.main as api_main

    async def _noop_async():
        return None

    api_main.engine = engine
    api_main.setup_scheduler = lambda: None
    api_main.start_scheduler = lambda: None
    api_main.shutdown_scheduler = lambda: None
    api_main.telegram_bot_service.start = _noop_async
    api_main.telegram_bot_service.stop = _noop_async

    app = api_main.create_app()
    app.dependency_overrides[get_db] = override_get_db
    return app


@pytest.fixture
def client(app, db) -> Generator:
    """Create test client."""
    from fastapi.testclient import TestClient
    
    with TestClient(app) as c:
        yield c
