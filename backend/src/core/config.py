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
    cors_allowed_origins: list[str] = ["http://localhost:3000"]

    # App
    app_env: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    sql_echo: bool = False  # Separate flag — never enable in production; use DEBUG=true only locally
    app_name: str = "Car Rental Management System"
    api_prefix: str = "/api"

    # Scheduler
    scheduler_timezone: str = "Africa/Addis_Ababa"

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
