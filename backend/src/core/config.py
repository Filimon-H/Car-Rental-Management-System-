"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # File Storage
    file_storage_path: str = "../uploads"
    generated_docs_path: str = "../generated_docs"

    # CORS
    cors_allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]

    # App
    app_env: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    sql_echo: bool = False  # Separate flag — never enable in production; use DEBUG=true only locally
    app_name: str = "Car Rental Management System"
    api_prefix: str = "/api"
    # Every route is also served under /api/v1. The unversioned prefix stays as the
    # alias so existing clients keep working; new clients should use the versioned
    # path, which gives a breaking change somewhere to land later.
    api_version_prefix: str = "/api/v1"
    serve_unversioned_api: bool = True

    # Create tables directly from the models at startup, bypassing Alembic.
    # SQLite + development only, and off by default so migration gaps surface locally
    # instead of on deploy.
    auto_create_schema: bool = False

    # Logging — set log_file to enable size-capped rotation (10MB x 5 by default).
    # Unset means stdout only, which is correct when a process manager captures it.
    log_file: str | None = None
    log_max_bytes: int = 10 * 1024 * 1024
    log_backup_count: int = 5

    # Scheduler
    scheduler_timezone: str = "Africa/Addis_Ababa"
    # The scheduler runs in-process. With more than one uvicorn worker, every worker
    # would run every job — overdue_check mutates agreement status, so it must not
    # run concurrently. Set this false on all but one process (or run a dedicated
    # scheduler process) when scaling out.
    scheduler_enabled: bool = True

    # Telegram
    telegram_bot_enabled: bool = False
    telegram_bot_token: str | None = None
    telegram_bot_username: str | None = None
    telegram_bot_mode: Literal["polling", "disabled"] = "disabled"
    telegram_polling_timeout_seconds: int = 20
    telegram_link_code_expiry_minutes: int = 10

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
