"""Background scheduler for periodic jobs."""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.core.logging import get_logger

logger = get_logger(__name__)

scheduler = AsyncIOScheduler()


async def due_returns_reminder() -> None:
    """Send reminders for agreements due today."""
    logger.info("Running due returns reminder job")
    # Implementation will be added in US6


async def overdue_check() -> None:
    """Check and mark overdue agreements."""
    logger.info("Running overdue check job")
    # Implementation will be added in US6


async def insurance_expiry_check() -> None:
    """Check for vehicles with expiring insurance."""
    logger.info("Running insurance expiry check job")
    # Implementation will be added in US6


async def outstanding_balance_summary() -> None:
    """Generate outstanding balance summary."""
    logger.info("Running outstanding balance summary job")
    # Implementation will be added in US6


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
