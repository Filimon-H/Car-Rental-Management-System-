"""Merge duplicate customer records into one.

Duplicates arise when the same person is entered by staff and later signs up
online, or signs up twice. Their rentals, documents and logins end up split
across records, so staff see half a history and the person sees half their
bookings.

A merge moves everything that points at the duplicates onto the record being
kept, then retires the duplicates. Nothing is deleted: a retired record is
deactivated and says in its notes where it went, so a wrong merge can be
traced and undone by hand.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from src.core.errors import BusinessError, ErrorCode, NotFoundError
from src.models.agreement import Agreement
from src.models.audit_event import AuditAction
from src.models.collateral_person import CollateralPerson
from src.models.customer import Customer
from src.models.customer_document import CustomerDocument
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink
from src.services.audit_service import create_audit_event

# Every table with a foreign key to customers.id. test_customer_merge checks
# this against the schema, so a new one cannot be silently left behind.
REASSIGNED = (Agreement, CollateralPerson, CustomerDocument)

# Filled from a duplicate only where the kept record has nothing.
PLAIN_FIELDS = (
    "company_name", "tin_number", "phone_secondary", "email",
    "house_number", "wereda", "subcity", "city",
    "emergency_contact_name", "emergency_contact_phone", "telegram_username",
)
# Moved as a unit: an ID number with another document's expiry date is worse
# than either alone. The record with the most complete set wins.
DOCUMENT_GROUPS = (
    ("id_type", "id_number", "id_expiry"),
    ("license_number", "license_expiry"),
)


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _completeness(customer: Customer, group: tuple[str, ...]) -> int:
    return sum(not _blank(getattr(customer, f)) for f in group)


def _choose_login(db: Session, logins: list[CustomerUser]) -> CustomerUser:
    """The login worth keeping: the one linked to Telegram, else the newest."""
    linked = {
        link.customer_user_id
        for link in db.query(TelegramCustomerLink)
        .filter(TelegramCustomerLink.customer_user_id.in_([u.id for u in logins]))
        .all()
    }
    return sorted(logins, key=lambda u: (u.id in linked, u.is_active, u.created_at, u.id))[-1]


def merge_customers(
    db: Session,
    keep_id: int,
    duplicate_ids: list[int],
    *,
    actor_id: int | None = None,
    commit: bool = True,
) -> dict:
    """Fold `duplicate_ids` into `keep_id` and return what moved.

    Commits on success; on any error nothing is written. With commit=False
    the work is only flushed, for a dry run the caller rolls back.
    """
    duplicate_ids = [d for d in dict.fromkeys(duplicate_ids) if d != keep_id]
    if not duplicate_ids:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Name at least one other customer to merge")

    keep = db.get(Customer, keep_id)
    if not keep:
        raise NotFoundError("Customer", keep_id)
    dups: list[Customer] = []
    for dup_id in duplicate_ids:
        dup = db.get(Customer, dup_id)
        if not dup:
            raise NotFoundError("Customer", dup_id)
        dups.append(dup)

    summary: dict = {"kept": keep_id, "merged": duplicate_ids, "moved": {}, "fields": {}, "logins": {}}
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        for model in REASSIGNED:
            moved = (
                db.query(model)
                .filter(model.customer_id.in_(duplicate_ids))
                .update({model.customer_id: keep_id}, synchronize_session=False)
            )
            summary["moved"][model.__tablename__] = moved

        # Identity documents: the most complete set, the kept record on a tie.
        overridden: list[str] = []
        for group in DOCUMENT_GROUPS:
            best = max([keep, *dups], key=lambda c: (_completeness(c, group), c is keep))
            if best is not keep:
                before = {f: getattr(keep, f) for f in group}
                if any(not _blank(v) for v in before.values()):
                    overridden.append(", ".join(f"{f}={v}" for f, v in before.items() if not _blank(v)))
                for f in group:
                    setattr(keep, f, getattr(best, f))
                summary["fields"][group[0]] = f"from #{best.id}"

        for f in PLAIN_FIELDS:
            if _blank(getattr(keep, f)):
                donor = next((d for d in dups if not _blank(getattr(d, f))), None)
                if donor:
                    setattr(keep, f, getattr(donor, f))
                    summary["fields"][f] = f"from #{donor.id}"

        # A customer has at most one login. Keep the best one on the kept
        # record; switch the rest off and end their sessions.
        logins = db.query(CustomerUser).filter(CustomerUser.customer_id.in_([keep_id, *duplicate_ids])).all()
        if logins:
            chosen = _choose_login(db, logins)
            for login in logins:
                if login is chosen:
                    continue
                login.is_active = False
                login.token_version += 1
                summary["logins"][login.email] = "deactivated"
            if chosen.customer_id != keep_id:
                db.flush()  # the unique customer_id must be free first
                chosen.customer_id = keep_id
            summary["logins"][chosen.email] = "kept"

        note = f"[{stamp}] Merged customers {', '.join(f'#{d}' for d in duplicate_ids)} into this record."
        if overridden:
            note += f" Replaced older document details: {'; '.join(overridden)}."
        keep.notes = f"{keep.notes}\n{note}".strip() if not _blank(keep.notes) else note
        for dup in dups:
            dup.is_active = False
            retired = f"[{stamp}] Merged into customer #{keep_id}; this record is retired."
            dup.notes = f"{dup.notes}\n{retired}".strip() if not _blank(dup.notes) else retired

        create_audit_event(
            db,
            action=AuditAction.CUSTOMER_UPDATED,
            entity_type="customer",
            entity_id=keep_id,
            actor_id=actor_id,
            details={"merge": summary},
            auto_commit=False,
        )
        if commit:
            db.commit()
        else:
            db.flush()
    except Exception:
        db.rollback()
        raise
    return summary
