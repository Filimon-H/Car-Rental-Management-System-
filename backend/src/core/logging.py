"""Structured logging with request correlation ID."""

import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Any

from src.core.config import settings

# Context variable for request correlation ID
correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> str | None:
    """Get the current correlation ID."""
    return correlation_id_var.get()


def set_correlation_id(correlation_id: str | None = None) -> str:
    """Set a new correlation ID. Returns the ID."""
    cid = correlation_id or str(uuid.uuid4())
    correlation_id_var.set(cid)
    return cid


class CorrelationIdFilter(logging.Filter):
    """Add correlation ID to log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = get_correlation_id() or "no-correlation-id"
        return True


class PIIFilter(logging.Filter):
    """Filter out PII from log messages."""

    PII_PATTERNS = [
        "password",
        "phone",
        "license",
        "address",
        "token",
        "secret",
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if hasattr(record, "msg") and isinstance(record.msg, str):
            msg_lower = record.msg.lower()
            for pattern in self.PII_PATTERNS:
                if pattern in msg_lower:
                    record.msg = f"[PII REDACTED] {pattern} field logged"
                    record.args = ()
                    break
        return True


def setup_logging() -> None:
    """Configure application logging."""
    log_format = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"

    logging.basicConfig(
        level=logging.DEBUG if settings.debug else logging.INFO,
        format=log_format,
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)


def log_with_context(
    logger: logging.Logger,
    level: int,
    message: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Log a message with additional context."""
    if extra:
        message = f"{message} | context: {extra}"
    logger.log(level, message)
