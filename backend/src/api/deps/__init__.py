"""API dependencies package."""

from src.api.deps.auth import (
    CurrentUser,
    AdminUser,
    get_current_user,
    require_permission,
    require_role,
    require_admin,
    get_client_ip,
    get_user_agent,
)
from src.core.db import get_db

__all__ = [
    "CurrentUser",
    "AdminUser",
    "get_current_user",
    "require_permission",
    "require_role",
    "require_admin",
    "get_client_ip",
    "get_user_agent",
    "get_db",
]
