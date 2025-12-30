"""Role-based access control primitives."""

from enum import Enum
from functools import wraps
from typing import Callable, TypeVar

from src.core.errors import ForbiddenError

F = TypeVar("F", bound=Callable)


class Role(str, Enum):
    """User roles."""

    ADMIN = "admin"
    SALES = "sales"
    FLEET = "fleet"
    INSPECTOR = "inspector"
    ACCOUNTANT = "accountant"


class Permission(str, Enum):
    """Granular permissions."""

    # User management
    MANAGE_USERS = "manage_users"

    # Customer/Vendor
    VIEW_CUSTOMERS = "view_customers"
    MANAGE_CUSTOMERS = "manage_customers"
    VIEW_VENDORS = "view_vendors"
    MANAGE_VENDORS = "manage_vendors"

    # Fleet
    VIEW_VEHICLES = "view_vehicles"
    MANAGE_VEHICLES = "manage_vehicles"

    # Agreements
    VIEW_AGREEMENTS = "view_agreements"
    CREATE_AGREEMENTS = "create_agreements"
    MANAGE_AGREEMENTS = "manage_agreements"
    CLOSE_AGREEMENTS = "close_agreements"

    # Finance
    VIEW_LEDGER = "view_ledger"
    POST_PAYMENTS = "post_payments"
    POST_ADJUSTMENTS = "post_adjustments"

    # Inspections
    VIEW_INSPECTIONS = "view_inspections"
    CREATE_INSPECTIONS = "create_inspections"
    MANAGE_INSPECTIONS = "manage_inspections"

    # Booking requests
    VIEW_BOOKINGS = "view_bookings"
    MANAGE_BOOKINGS = "manage_bookings"

    # Reports
    VIEW_REPORTS = "view_reports"
    VIEW_DASHBOARD = "view_dashboard"

    # Printing
    PRINT_DOCUMENTS = "print_documents"


# Role to permissions mapping
ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    Role.ADMIN: set(Permission),  # Admin has all permissions
    Role.SALES: {
        Permission.VIEW_CUSTOMERS,
        Permission.MANAGE_CUSTOMERS,
        Permission.VIEW_VENDORS,
        Permission.VIEW_VEHICLES,
        Permission.VIEW_AGREEMENTS,
        Permission.CREATE_AGREEMENTS,
        Permission.MANAGE_AGREEMENTS,
        Permission.CLOSE_AGREEMENTS,
        Permission.VIEW_LEDGER,
        Permission.POST_PAYMENTS,
        Permission.VIEW_BOOKINGS,
        Permission.MANAGE_BOOKINGS,
        Permission.VIEW_DASHBOARD,
        Permission.PRINT_DOCUMENTS,
    },
    Role.FLEET: {
        Permission.VIEW_CUSTOMERS,
        Permission.VIEW_VENDORS,
        Permission.MANAGE_VENDORS,
        Permission.VIEW_VEHICLES,
        Permission.MANAGE_VEHICLES,
        Permission.VIEW_AGREEMENTS,
        Permission.VIEW_INSPECTIONS,
        Permission.VIEW_DASHBOARD,
    },
    Role.INSPECTOR: {
        Permission.VIEW_VEHICLES,
        Permission.VIEW_AGREEMENTS,
        Permission.VIEW_INSPECTIONS,
        Permission.CREATE_INSPECTIONS,
        Permission.MANAGE_INSPECTIONS,
        Permission.PRINT_DOCUMENTS,
    },
    Role.ACCOUNTANT: {
        Permission.VIEW_CUSTOMERS,
        Permission.VIEW_VENDORS,
        Permission.VIEW_AGREEMENTS,
        Permission.VIEW_LEDGER,
        Permission.POST_PAYMENTS,
        Permission.POST_ADJUSTMENTS,
        Permission.VIEW_REPORTS,
        Permission.VIEW_DASHBOARD,
        Permission.PRINT_DOCUMENTS,
    },
}


def has_permission(role: Role, permission: Permission) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def has_any_permission(role: Role, permissions: list[Permission]) -> bool:
    """Check if a role has any of the specified permissions."""
    return any(has_permission(role, p) for p in permissions)


def has_all_permissions(role: Role, permissions: list[Permission]) -> bool:
    """Check if a role has all of the specified permissions."""
    return all(has_permission(role, p) for p in permissions)


def require_permission(permission: Permission) -> Callable[[F], F]:
    """Decorator to require a specific permission."""

    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # The actual check happens in the dependency
            # This decorator is for documentation/typing purposes
            return func(*args, **kwargs)

        # Store required permission for dependency injection
        wrapper._required_permission = permission  # type: ignore
        return wrapper  # type: ignore

    return decorator
