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
    auto_commit: bool = True,
) -> AuditEvent:
    """Create and persist an audit event.

    Args:
        auto_commit: If False, the event is flushed but not committed, so it lands in
            the caller's transaction. Use this inside multi-step operations (closing
            an agreement, posting to the ledger) so the audit row is rolled back with
            the work it describes rather than outliving a failed operation.
    """
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
    if auto_commit:
        db.commit()
        db.refresh(event)
    else:
        db.flush()

    logger.info(
        f"Audit event created: {action.value} on {entity_type}:{entity_id} by actor:{actor_id}"
    )
    return event


def log_financial_event(
    db: Session,
    action: AuditAction,
    agreement_id: int,
    amount: Any,
    actor_id: int | None = None,
    details: dict[str, Any] | None = None,
    auto_commit: bool = True,
) -> AuditEvent:
    """Record a money-moving action against an agreement.

    The ledger records that a balance changed; this records who authorised it.
    """
    payload: dict[str, Any] = {"amount": str(amount)}
    if details:
        payload.update(details)
    return create_audit_event(
        db=db,
        action=action,
        entity_type="agreement",
        entity_id=agreement_id,
        actor_id=actor_id,
        details=payload,
        auto_commit=auto_commit,
    )


def log_agreement_event(
    db: Session,
    action: AuditAction,
    agreement_id: int,
    actor_id: int | None = None,
    details: dict[str, Any] | None = None,
    auto_commit: bool = True,
) -> AuditEvent:
    """Record an agreement lifecycle transition."""
    return create_audit_event(
        db=db,
        action=action,
        entity_type="agreement",
        entity_id=agreement_id,
        actor_id=actor_id,
        details=details,
        auto_commit=auto_commit,
    )


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
