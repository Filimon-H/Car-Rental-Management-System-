"""API routers package - router registration."""

from fastapi import FastAPI

from src.core.config import settings


def register_routers(app: FastAPI) -> None:
    """Register all API routers."""
    # Dashboard stats
    from src.api.routers import dashboard
    app.include_router(dashboard.router, prefix=f"{settings.api_prefix}/dashboard", tags=["dashboard"])

    # Auth routes
    from src.api.routers import auth
    app.include_router(auth.router, prefix=f"{settings.api_prefix}/auth", tags=["auth"])

    # Me route
    from src.api.routers import me
    app.include_router(me.router, prefix=f"{settings.api_prefix}/me", tags=["me"])

    # Staff user management (admin only)
    from src.api.routers import users
    app.include_router(users.router, prefix=f"{settings.api_prefix}/users", tags=["users"])

    # Agreements routes
    from src.api.routers import agreements
    app.include_router(agreements.router, prefix=f"{settings.api_prefix}/agreements", tags=["agreements"])

    # Availability routes
    from src.api.routers import availability
    app.include_router(availability.router, prefix=f"{settings.api_prefix}/availability", tags=["availability"])

    # Customers routes
    from src.api.routers import customers
    app.include_router(customers.router, prefix=f"{settings.api_prefix}/customers", tags=["customers"])

    # Vendors routes
    from src.api.routers import vendors
    app.include_router(vendors.router, prefix=f"{settings.api_prefix}/vendors", tags=["vendors"])

    # Vehicles routes
    from src.api.routers import vehicles
    app.include_router(vehicles.router, prefix=f"{settings.api_prefix}/vehicles", tags=["vehicles"])

    # Inspections routes
    from src.api.routers import inspections
    app.include_router(inspections.router, prefix=f"{settings.api_prefix}/inspections", tags=["inspections"])

    # Documents routes
    from src.api.routers import documents
    app.include_router(documents.router, prefix=f"{settings.api_prefix}/documents", tags=["documents"])

    # Ledger routes
    from src.api.routers import ledger
    app.include_router(ledger.router, prefix=f"{settings.api_prefix}/ledger", tags=["ledger"])

    # Lookups routes (admin-managed dropdown values)
    from src.api.routers import lookups
    app.include_router(lookups.router, prefix=f"{settings.api_prefix}/lookups", tags=["lookups"])

    # Drivers routes
    from src.api.routers import drivers
    app.include_router(drivers.router, prefix=f"{settings.api_prefix}/drivers", tags=["drivers"])

    # Collateral Persons routes
    from src.api.routers import collaterals
    app.include_router(collaterals.router, prefix=f"{settings.api_prefix}/collaterals", tags=["collaterals"])

    # Collateral Documents routes (nested under collaterals)
    from src.api.routers import collateral_documents
    app.include_router(collateral_documents.router, prefix=f"{settings.api_prefix}/collaterals", tags=["collateral-documents"])

    # Customer Documents routes (nested under customers)
    from src.api.routers import customer_documents
    app.include_router(customer_documents.router, prefix=f"{settings.api_prefix}/customers", tags=["customer-documents"])

    # Customer Bulk Upload routes
    from src.api.routers import customer_bulk
    app.include_router(customer_bulk.router, prefix=f"{settings.api_prefix}/customers", tags=["customer-bulk"])
