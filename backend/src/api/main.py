"""FastAPI application factory and main entry point."""

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from src.core.config import settings
from src.core.db import Base, engine
from src.core.errors import AppException
from src.core.logging import get_logger, set_correlation_id, setup_logging
from src.core.metrics import metrics
from src.jobs.scheduler import setup_scheduler, shutdown_scheduler, start_scheduler
from src.services.telegram_bot_service import telegram_bot_service

logger = get_logger(__name__)


def _route_template(request: Request) -> str:
    """The matched route pattern, not the concrete path.

    Grouping by "/api/v1/agreements/{agreement_id}" keeps the metric cardinality
    bounded; using the raw path would create a new series per agreement id.
    """
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if path:
        return path
    # No route matched (404, or a static mount) — bucket them together.
    return "unmatched"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    setup_logging()
    logger.info(f"Starting {settings.app_name}")

    # Schema comes from Alembic (`alembic upgrade head`, which dev.sh runs on start).
    # create_all is opt-in because it silently papers over a missing migration: the
    # app works locally and then fails on a deploy that only applies migrations.
    if settings.auto_create_schema:
        if not (settings.database_url.startswith("sqlite") and settings.is_development):
            raise RuntimeError(
                "auto_create_schema is only supported for SQLite in development; "
                "use 'alembic upgrade head' instead"
            )
        import src.models  # noqa: F401
        logger.warning("auto_create_schema=true — creating tables directly, bypassing Alembic")
        Base.metadata.create_all(bind=engine)

    setup_scheduler()
    start_scheduler()
    await telegram_bot_service.start()
    yield
    # Shutdown
    await telegram_bot_service.stop()
    shutdown_scheduler()
    logger.info(f"Shutting down {settings.app_name}")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        lifespan=lifespan,
    )

    # Rate limiting — limiter must be on app.state before SlowAPIMiddleware
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Correlation ID middleware
    @app.middleware("http")
    async def correlation_id_middleware(request: Request, call_next):
        # set_correlation_id generates one when the client sends none; return that
        # generated value rather than an empty header, so a user reporting a problem
        # can quote an id that actually appears in the logs.
        correlation_id = set_correlation_id(request.headers.get("X-Correlation-ID"))

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            metrics.record_request(request.method, _route_template(request), 500, duration_ms)
            raise

        duration_ms = (time.perf_counter() - start) * 1000
        metrics.record_request(
            request.method, _route_template(request), response.status_code, duration_ms
        )

        response.headers["X-Correlation-ID"] = correlation_id
        response.headers["X-Response-Time-ms"] = f"{duration_ms:.1f}"
        return response

    # Exception handlers
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code.value,
                "detail": exc.detail,
            },
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        import traceback
        logger.error(f"Unhandled exception: {exc}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={
                "error_code": "INTERNAL_ERROR",
                "detail": str(exc) if settings.is_development else "Internal server error",
            },
        )

    # Health check endpoint. Verifies the database round-trips, so an unreachable
    # DB reports unhealthy instead of the process merely reporting itself alive.
    @app.get("/health")
    async def health_check():
        from sqlalchemy import text

        from src.core.db import SessionLocal

        db_ok = True
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        except Exception as exc:
            db_ok = False
            logger.error(f"Health check database probe failed: {exc}")
        finally:
            db.close()

        payload = {
            "status": "healthy" if db_ok else "unhealthy",
            "app": settings.app_name,
            "database": "up" if db_ok else "down",
        }
        return JSONResponse(status_code=200 if db_ok else 503, content=payload)

    # Metrics. Admin-only: latency and traffic per route reveal usage patterns, and
    # this is operational data rather than something every signed-in user needs.
    from src.api.deps.auth import AdminUser

    @app.get("/metrics", include_in_schema=False)
    async def metrics_json(_admin: AdminUser):
        return metrics.snapshot()

    @app.get("/metrics/prometheus", include_in_schema=False)
    async def metrics_prometheus(_admin: AdminUser) -> PlainTextResponse:
        return PlainTextResponse(
            metrics.prometheus(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    # Register routers
    from src.api.routers import register_routers

    register_routers(app)

    # Serve uploaded files (vehicle photos, etc.)
    app.mount(f"{settings.api_prefix}/uploads", StaticFiles(directory=settings.file_storage_path), name="uploads")

    return app


app = create_app()
