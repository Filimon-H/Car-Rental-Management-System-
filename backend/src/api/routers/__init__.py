"""API routers package - router registration."""

from fastapi import FastAPI

from src.core.config import settings


def register_routers(app: FastAPI) -> None:
    """Register every router under the versioned prefix, and under the legacy one.

    Routes are mounted twice so /api/v1/... and /api/... resolve to the same
    handlers. Existing clients (the frontend, the Telegram bot, saved links) keep
    working while new integrations can pin a version; a future breaking change then
    has /api/v2 to go to instead of silently changing /api.
    """
    prefixes = [settings.api_version_prefix]
    if settings.serve_unversioned_api and settings.api_prefix not in prefixes:
        prefixes.append(settings.api_prefix)

    for prefix in prefixes:
        # Only the first mount contributes to the OpenAPI schema, so /docs lists each
        # endpoint once (under the versioned path) rather than twice.
        _register_all(app, prefix, include_in_schema=(prefix == prefixes[0]))


def _register_all(app: FastAPI, api_prefix: str, include_in_schema: bool = True) -> None:
    """Register the full router set under one prefix."""
    # Dashboard stats
    from src.api.routers import dashboard
    app.include_router(dashboard.router, prefix=f"{api_prefix}/dashboard", tags=["dashboard"], include_in_schema=include_in_schema)

    # Auth routes
    from src.api.routers import auth
    app.include_router(auth.router, prefix=f"{api_prefix}/auth", tags=["auth"], include_in_schema=include_in_schema)

    # Me route
    from src.api.routers import me
    app.include_router(me.router, prefix=f"{api_prefix}/me", tags=["me"], include_in_schema=include_in_schema)

    # Staff user management (admin only)
    from src.api.routers import users
    app.include_router(users.router, prefix=f"{api_prefix}/users", tags=["users"], include_in_schema=include_in_schema)

    # Agreements routes
    from src.api.routers import agreements
    app.include_router(agreements.router, prefix=f"{api_prefix}/agreements", tags=["agreements"], include_in_schema=include_in_schema)

    # Availability routes
    from src.api.routers import availability
    app.include_router(availability.router, prefix=f"{api_prefix}/availability", tags=["availability"], include_in_schema=include_in_schema)

    # Customers routes
    from src.api.routers import customers
    app.include_router(customers.router, prefix=f"{api_prefix}/customers", tags=["customers"], include_in_schema=include_in_schema)

    # Vendors routes
    from src.api.routers import vendors
    app.include_router(vendors.router, prefix=f"{api_prefix}/vendors", tags=["vendors"], include_in_schema=include_in_schema)

    # Vehicles routes
    from src.api.routers import vehicles
    app.include_router(vehicles.router, prefix=f"{api_prefix}/vehicles", tags=["vehicles"], include_in_schema=include_in_schema)

    # Inspections routes
    from src.api.routers import inspections
    app.include_router(inspections.router, prefix=f"{api_prefix}/inspections", tags=["inspections"], include_in_schema=include_in_schema)

    # Documents routes
    from src.api.routers import documents
    app.include_router(documents.router, prefix=f"{api_prefix}/documents", tags=["documents"], include_in_schema=include_in_schema)

    # Ledger routes
    from src.api.routers import ledger
    app.include_router(ledger.router, prefix=f"{api_prefix}/ledger", tags=["ledger"], include_in_schema=include_in_schema)

    # Lookups routes (admin-managed dropdown values)
    from src.api.routers import lookups
    app.include_router(lookups.router, prefix=f"{api_prefix}/lookups", tags=["lookups"], include_in_schema=include_in_schema)

    # Drivers routes
    from src.api.routers import drivers
    app.include_router(drivers.router, prefix=f"{api_prefix}/drivers", tags=["drivers"], include_in_schema=include_in_schema)

    # Collateral Persons routes
    from src.api.routers import collaterals
    app.include_router(collaterals.router, prefix=f"{api_prefix}/collaterals", tags=["collaterals"], include_in_schema=include_in_schema)

    # Collateral Documents routes (nested under collaterals)
    from src.api.routers import collateral_documents
    app.include_router(collateral_documents.router, prefix=f"{api_prefix}/collaterals", tags=["collateral-documents"], include_in_schema=include_in_schema)

    # Customer Documents routes (nested under customers)
    from src.api.routers import customer_documents
    app.include_router(customer_documents.router, prefix=f"{api_prefix}/customers", tags=["customer-documents"], include_in_schema=include_in_schema)

    # Customer Bulk Upload routes
    from src.api.routers import customer_bulk
    app.include_router(customer_bulk.router, prefix=f"{api_prefix}/customers", tags=["customer-bulk"], include_in_schema=include_in_schema)

    # Vehicle maintenance history
    from src.api.routers import maintenance
    app.include_router(maintenance.router, prefix=f"{api_prefix}/maintenance", tags=["maintenance"], include_in_schema=include_in_schema)

    # Reporting and CSV exports
    from src.api.routers import reports
    app.include_router(reports.router, prefix=f"{api_prefix}/reports", tags=["reports"], include_in_schema=include_in_schema)

    # Public customer-facing routes (no staff auth)
    from src.api.routers import public
    app.include_router(public.router, prefix=f"{api_prefix}/public", tags=["public"], include_in_schema=include_in_schema)
