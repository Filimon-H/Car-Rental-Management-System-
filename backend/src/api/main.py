"""FastAPI application factory and main entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.core.config import settings
from src.core.db import Base, engine
from src.core.errors import AppException
from src.core.logging import get_logger, set_correlation_id, setup_logging
from src.jobs.scheduler import setup_scheduler, shutdown_scheduler, start_scheduler
from src.services.telegram_bot_service import telegram_bot_service

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    setup_logging()
    logger.info(f"Starting {settings.app_name}")

    if settings.database_url.startswith("sqlite") and settings.is_development:
        import src.models  # noqa: F401
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

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"] if settings.is_development else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Correlation ID middleware
    @app.middleware("http")
    async def correlation_id_middleware(request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID")
        set_correlation_id(correlation_id)
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id or ""
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

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "app": settings.app_name}

    # Register routers
    from src.api.routers import register_routers

    register_routers(app)

    # Serve uploaded files (vehicle photos, etc.)
    app.mount(f"{settings.api_prefix}/uploads", StaticFiles(directory=settings.file_storage_path), name="uploads")

    return app


app = create_app()
