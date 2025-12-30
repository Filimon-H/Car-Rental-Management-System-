"""Audit event service for tracking actions."""

from typing import Any

from sqlalchemy.orm import Session

from src.core.logging import get_correlation_id, get_logger
from src.models.audit_event import AuditAction, AuditEvent

logger = get_logger(__name__)


def create_audit_event(
    db: Session,
    action: AuditAction,
    entity_type: str,
    entity_id: int | None = None,
    actor_id: int | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditEvent:
    """Create and persist an audit event."""
    event = AuditEvent(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
        correlation_id=get_correlation_id(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    logger.info(
        f"Audit event created: {action.value} on {entity_type}:{entity_id} by actor:{actor_id}"
    )
    return event


def log_login(
    db: Session,
    user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditEvent:
    """Log a successful login."""
    return create_audit_event(
        db=db,
        action=AuditAction.LOGIN,
        entity_type="staff_user",
        entity_id=user_id,
        actor_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )


def log_login_failed(
    db: Session,
    username: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditEvent:
    """Log a failed login attempt."""
    return create_audit_event(
        db=db,
        action=AuditAction.LOGIN_FAILED,
        entity_type="staff_user",
        details={"username": username},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def log_logout(
    db: Session,
    user_id: int,
    ip_address: str | None = None,
) -> AuditEvent:
    """Log a logout."""
    return create_audit_event(
        db=db,
        action=AuditAction.LOGOUT,
        entity_type="staff_user",
        entity_id=user_id,
        actor_id=user_id,
        ip_address=ip_address,
    )
