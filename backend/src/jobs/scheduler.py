"""Background scheduler for periodic jobs."""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.core.logging import get_logger
from src.core.rbac import Permission
from src.services.telegram_bot_service import telegram_bot_service

logger = get_logger(__name__)

scheduler = AsyncIOScheduler()


async def due_returns_reminder() -> None:
    """Send reminders for agreements due today."""
    from datetime import datetime, timezone
    from src.core.db import SessionLocal
    from src.models.agreement import Agreement, AgreementStatus

    logger.info("Running due returns reminder job")
    db = SessionLocal()
    try:
        today = datetime.now(timezone.utc).date()
        agreements = (
            db.query(Agreement)
            .filter(Agreement.status == AgreementStatus.ACTIVE)
            .all()
        )
        due_today = []
        for agreement in agreements:
            expected_return = agreement.expected_return_datetime
            if expected_return.tzinfo is None:
                expected_return = expected_return.replace(tzinfo=timezone.utc)
            else:
                expected_return = expected_return.astimezone(timezone.utc)
            if expected_return.date() == today:
                due_today.append(
                    f"{agreement.agreement_number} | {agreement.customer.full_name} | "
                    f"{expected_return.strftime('%H:%M UTC')}"
                )
        logger.info("Agreements due today: %s", ", ".join(due_today) if due_today else "none")
        if due_today:
            await telegram_bot_service.send_message_to_permission(
                Permission.VIEW_AGREEMENTS,
                "Due today agreements:\n" + "\n".join(due_today[:10]),
            )
    finally:
        db.close()


async def overdue_check() -> None:
    """Check and mark overdue agreements.
    
    Marks ACTIVE agreements as OVERDUE if expected_return_datetime has passed.
    """
    from datetime import datetime, timezone
    from src.core.db import SessionLocal
    from src.models.agreement import Agreement, AgreementStatus

    logger.info("Running overdue check job")
    
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        
        # Find active agreements past their expected return
        overdue_agreements = (
            db.query(Agreement)
            .filter(
                Agreement.status == AgreementStatus.ACTIVE,
                Agreement.expected_return_datetime < now,
            )
            .all()
        )
        
        count = 0
        for agreement in overdue_agreements:
            agreement.status = AgreementStatus.OVERDUE
            count += 1
            logger.info(f"Marked agreement {agreement.agreement_number} as overdue")
        
        if count > 0:
            db.commit()
            logger.info(f"Marked {count} agreements as overdue")
            alert_lines = [
                f"{agreement.agreement_number} | {agreement.customer.full_name} | "
                f"{agreement.expected_return_datetime.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
                for agreement in overdue_agreements[:10]
            ]
            await telegram_bot_service.send_message_to_permission(
                Permission.VIEW_AGREEMENTS,
                "Overdue agreement alerts:\n" + "\n".join(alert_lines),
            )
        else:
            logger.info("No agreements to mark as overdue")
    except Exception as e:
        logger.error(f"Error in overdue check job: {e}")
        db.rollback()
    finally:
        db.close()


async def insurance_expiry_check() -> None:
    """Check for vehicles with expiring insurance."""
    from datetime import datetime, timedelta, timezone
    from src.core.db import SessionLocal
    from src.models.vehicle import Vehicle

    logger.info("Running insurance expiry check job")
    db = SessionLocal()
    try:
        threshold = datetime.now(timezone.utc) + timedelta(days=30)
        expiring = (
            db.query(Vehicle)
            .filter(Vehicle.insurance_expiry.isnot(None), Vehicle.insurance_expiry <= threshold)
            .count()
        )
        logger.info("Vehicles with insurance expiring within 30 days: %s", expiring)
    finally:
        db.close()


async def outstanding_balance_summary() -> None:
    """Generate outstanding balance summary."""
    from decimal import Decimal
    from src.core.db import SessionLocal
    from src.models.agreement import Agreement
    from src.services import agreement_service

    logger.info("Running outstanding balance summary job")
    db = SessionLocal()
    try:
        total_outstanding = Decimal("0")
        outstanding_count = 0
        top_lines: list[str] = []
        for agreement in db.query(Agreement).all():
            summary = agreement_service.get_agreement_summary(db, agreement.id)
            if summary["balance_due"] > 0:
                outstanding_count += 1
                total_outstanding += summary["balance_due"]
                if len(top_lines) < 10:
                    top_lines.append(
                        f"{agreement.agreement_number} | {agreement.customer.full_name} | ETB {summary['balance_due']}"
                    )
        logger.info(
            "Outstanding balance summary: agreements=%s total=%s",
            outstanding_count,
            total_outstanding,
        )
        if outstanding_count > 0:
            await telegram_bot_service.send_message_to_permission(
                Permission.VIEW_LEDGER,
                "Outstanding balances:\n"
                + "\n".join(top_lines)
                + f"\nTotal agreements: {outstanding_count}\nTotal outstanding: ETB {total_outstanding}",
            )
    finally:
        db.close()


def setup_scheduler() -> None:
    """Configure and start the scheduler."""
    # Due returns reminder - daily at 8 AM
    scheduler.add_job(
        due_returns_reminder,
        CronTrigger(hour=8, minute=0),
        id="due_returns_reminder",
        replace_existing=True,
    )

    # Overdue check - every hour
    scheduler.add_job(
        overdue_check,
        CronTrigger(minute=0),
        id="overdue_check",
        replace_existing=True,
    )

    # Insurance expiry check - daily at 9 AM
    scheduler.add_job(
        insurance_expiry_check,
        CronTrigger(hour=9, minute=0),
        id="insurance_expiry_check",
        replace_existing=True,
    )

    # Outstanding balance summary - daily at 6 PM
    scheduler.add_job(
        outstanding_balance_summary,
        CronTrigger(hour=18, minute=0),
        id="outstanding_balance_summary",
        replace_existing=True,
    )

    logger.info("Scheduler configured with periodic jobs")


def start_scheduler() -> None:
    """Start the scheduler."""
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started")


def shutdown_scheduler() -> None:
    """Shutdown the scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler shutdown")
