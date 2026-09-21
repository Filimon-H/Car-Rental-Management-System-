"""Shared customer identity and duplicate checks."""

from sqlalchemy.orm import Session

from src.models.customer import Customer


def normalize_phone(value: str) -> str:
    """Return a comparable Ethiopian phone number without presentation characters."""
    phone = "".join(character for character in value if character.isdigit())
    if phone.startswith("251"):
        return phone
    if phone.startswith("0"):
        return f"251{phone[1:]}"
    return phone


def find_customer_by_phone(
    db: Session, phone: str, *, exclude_customer_id: int | None = None
) -> Customer | None:
    """Find an active customer by normalized phone number."""
    target = normalize_phone(phone)
    query = db.query(Customer).filter(Customer.is_active.is_(True))
    if exclude_customer_id is not None:
        query = query.filter(Customer.id != exclude_customer_id)
    return next(
        (customer for customer in query.all() if normalize_phone(customer.phone_primary) == target),
        None,
    )
