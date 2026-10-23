"""Attach an online login to a customer who was first entered at the counter.

Signup refused such a customer outright ("Phone number already registered"),
and knowing someone's phone number proves nothing, so the link needs proof:

- Telegram: the person signs up on the website, then shares their own phone
  number with the bot. Telegram supplies a number it has verified for that
  account, so a match with the record is proof of the phone.
- Invite: staff, who have seen the person's ID, create a one-time link; the
  person opens it and sets an email and password.

Tokens are random and single-use; only their SHA-256 is stored.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from src.core.config import settings
from fastapi import status

from src.core.errors import AppException, BusinessError, ConflictError, ErrorCode, NotFoundError
from src.core.security import hash_password
from src.models.account_claim import CustomerAccountClaim
from src.models.audit_event import AuditAction
from src.models.customer import Customer
from src.models.customer_user import CustomerUser
from src.models.telegram import TelegramCustomerLink, TelegramStaffLink
from src.services.audit_service import create_audit_event
from src.services.customer_validation_service import find_customer_by_phone, normalize_phone

TELEGRAM = "telegram"
INVITE = "invite"
TELEGRAM_CLAIM_TTL = timedelta(minutes=30)
INVITE_TTL = timedelta(hours=72)
MAX_PHONE_ATTEMPTS = 3
# The staff "bot link code" gives a walk-in customer a login with one of these
# addresses and a random password: usable from Telegram, not the website. A
# claim upgrades it instead of treating the customer as already registered.
BOT_ONLY_EMAIL_DOMAIN = "@bot.nodcarrent.internal"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class UnknownLink(AppException):
    """A token that matches nothing. The message never echoes the token."""

    def __init__(self) -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND,
                         "This link is not valid. Ask us for a new one.")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token() -> str:
    # 32 URL-safe characters: fits a Telegram /start payload (64 max, [A-Za-z0-9_-]).
    return secrets.token_urlsafe(24)


def is_bot_only(login: CustomerUser | None) -> bool:
    return bool(login and login.email.endswith(BOT_ONLY_EMAIL_DOMAIN))


def claimable_customer(db: Session, phone: str) -> Customer | None:
    """The counter-created customer this phone belongs to, if it has no website login."""
    customer = find_customer_by_phone(db, phone)
    if customer is None:
        return None
    login = db.query(CustomerUser).filter(CustomerUser.customer_id == customer.id).first()
    return customer if login is None or is_bot_only(login) else None


def telegram_start_url(token: str) -> str | None:
    if not settings.telegram_bot_username:
        return None
    return f"https://t.me/{settings.telegram_bot_username.lstrip('@')}?start=claim_{token}"


def invite_url(token: str) -> str:
    return f"{settings.public_site_url.rstrip('/')}/claim/{token}"


def _open_claim(db: Session, token: str, kind: str) -> CustomerAccountClaim:
    claim = db.query(CustomerAccountClaim).filter(CustomerAccountClaim.token_hash == _hash(token)).first()
    if claim is None or claim.kind != kind:
        raise UnknownLink()
    if claim.used_at is not None:
        raise BusinessError(ErrorCode.INVALID_INPUT, "This link has already been used. Sign in instead.")
    if _as_utc(claim.expires_at) < _now():
        raise BusinessError(ErrorCode.INVALID_INPUT, "This link has expired. Ask us for a new one.")
    return claim


def _supersede(db: Session, customer_id: int, kind: str) -> None:
    """Only the newest open claim of a kind works; older links stop."""
    db.query(CustomerAccountClaim).filter(
        CustomerAccountClaim.customer_id == customer_id,
        CustomerAccountClaim.kind == kind,
        CustomerAccountClaim.used_at.is_(None),
    ).update({CustomerAccountClaim.expires_at: _now()}, synchronize_session=False)


def _ensure_email_free(db: Session, email: str, customer_id: int) -> None:
    taken = db.query(CustomerUser).filter(CustomerUser.email == email).first()
    if taken and taken.customer_id != customer_id:
        raise ConflictError("Email already registered")


def _attach_login(db: Session, customer: Customer, email: str, hashed_password: str) -> CustomerUser:
    """Give the customer a website login, upgrading a bot-only one."""
    _ensure_email_free(db, email, customer.id)
    login = db.query(CustomerUser).filter(CustomerUser.customer_id == customer.id).first()
    if login and not is_bot_only(login):
        raise ConflictError("This customer already has an online account. Sign in instead.")
    if login:
        login.email = email
        login.hashed_password = hashed_password
        login.is_active = True
    else:
        login = CustomerUser(customer_id=customer.id, email=email, hashed_password=hashed_password,
                             token_version=0, is_active=True)
        db.add(login)
    if not customer.email:
        customer.email = email
    db.flush()
    return login


# --- Telegram -------------------------------------------------------------

def start_telegram_claim(db: Session, customer: Customer, email: str, password: str) -> str:
    """Hold a signup until the person confirms their phone on Telegram. Returns the token."""
    _ensure_email_free(db, email, customer.id)
    _supersede(db, customer.id, TELEGRAM)
    token = _new_token()
    db.add(CustomerAccountClaim(
        customer_id=customer.id, kind=TELEGRAM, token_hash=_hash(token),
        email=email, hashed_password=hash_password(password),
        expires_at=_now() + TELEGRAM_CLAIM_TTL,
    ))
    db.commit()
    return token


def open_telegram_claim(db: Session, token: str, telegram_user_id: int) -> CustomerAccountClaim:
    """The person opened the bot from their claim link: remember who they are."""
    claim = _open_claim(db, token, TELEGRAM)
    claim.telegram_user_id = telegram_user_id
    db.commit()
    return claim


class PhoneMismatch(BusinessError):
    def __init__(self, attempts_left: int):
        super().__init__(ErrorCode.INVALID_INPUT, "That phone number does not match our record.")
        self.attempts_left = attempts_left


def confirm_telegram_contact(
    db: Session,
    *,
    telegram_user_id: int,
    chat_id: int,
    telegram_username: str | None,
    contact_user_id: int | None,
    contact_phone: str,
) -> CustomerUser | None:
    """Finish a Telegram claim from a shared contact.

    Returns the login on success, None when this Telegram user has no open
    claim. The contact must be the sender's own: anyone can forward someone
    else's contact card, but only the account owner can share their own.
    """
    claim = (
        db.query(CustomerAccountClaim)
        .filter(
            CustomerAccountClaim.kind == TELEGRAM,
            CustomerAccountClaim.telegram_user_id == telegram_user_id,
            CustomerAccountClaim.used_at.is_(None),
        )
        .order_by(CustomerAccountClaim.id.desc())
        .first()
    )
    if claim is None or _as_utc(claim.expires_at) < _now():
        return None
    if contact_user_id != telegram_user_id:
        raise BusinessError(ErrorCode.INVALID_INPUT, "Share your own phone number with the button, not a contact.")

    customer = db.get(Customer, claim.customer_id)
    if normalize_phone(contact_phone) != normalize_phone(customer.phone_primary):
        claim.attempts += 1
        if claim.attempts >= MAX_PHONE_ATTEMPTS:
            claim.expires_at = _now()
        db.commit()
        raise PhoneMismatch(max(0, MAX_PHONE_ATTEMPTS - claim.attempts))

    login = _attach_login(db, customer, claim.email, claim.hashed_password)
    # They have just proved this Telegram account is theirs: link it too, with
    # the chat holding exactly one role, as /link does.
    db.query(TelegramCustomerLink).filter(
        (TelegramCustomerLink.customer_user_id == login.id)
        | (TelegramCustomerLink.telegram_user_id == telegram_user_id)
        | (TelegramCustomerLink.chat_id == chat_id)
    ).delete(synchronize_session=False)
    db.query(TelegramStaffLink).filter(
        (TelegramStaffLink.telegram_user_id == telegram_user_id) | (TelegramStaffLink.chat_id == chat_id)
    ).delete(synchronize_session=False)
    db.flush()
    now = _now()
    db.add(TelegramCustomerLink(customer_user_id=login.id, telegram_user_id=telegram_user_id, chat_id=chat_id,
                                telegram_username=telegram_username, linked_at=now, last_seen_at=now,
                                is_active=True))
    claim.used_at = now
    claim.hashed_password = None  # no longer needed
    create_audit_event(db, AuditAction.CUSTOMER_UPDATED, "customer", customer.id,
                       details={"online_account": "linked via Telegram phone check"}, auto_commit=False)
    db.commit()
    return login


def telegram_claim_status(db: Session, token: str) -> tuple[str, CustomerUser | None]:
    """'pending', 'linked' (with the login, briefly) or 'expired'."""
    claim = db.query(CustomerAccountClaim).filter(CustomerAccountClaim.token_hash == _hash(token)).first()
    if claim is None or claim.kind != TELEGRAM:
        raise UnknownLink()
    if claim.used_at is not None:
        # Sign the waiting page in once, shortly after; later it must sign in.
        fresh = _now() - _as_utc(claim.used_at) < timedelta(minutes=10)
        login = db.query(CustomerUser).filter(CustomerUser.customer_id == claim.customer_id).first()
        return "linked", login if fresh else None
    if _as_utc(claim.expires_at) < _now():
        return "expired", None
    return "pending", None


# --- Staff invite -----------------------------------------------------------

def create_invite(db: Session, customer_id: int, staff_id: int | None) -> tuple[str, CustomerAccountClaim]:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("Customer", customer_id)
    login = db.query(CustomerUser).filter(CustomerUser.customer_id == customer_id).first()
    if login and not is_bot_only(login):
        raise ConflictError("This customer already has an online account.")
    _supersede(db, customer_id, INVITE)
    token = _new_token()
    claim = CustomerAccountClaim(customer_id=customer_id, kind=INVITE, token_hash=_hash(token),
                                 created_by_id=staff_id, expires_at=_now() + INVITE_TTL)
    db.add(claim)
    create_audit_event(db, AuditAction.CUSTOMER_UPDATED, "customer", customer_id, actor_id=staff_id,
                       details={"online_account": "invite created"}, auto_commit=False)
    db.commit()
    db.refresh(claim)
    return token, claim


def open_invite(db: Session, token: str) -> tuple[CustomerAccountClaim, Customer]:
    claim = _open_claim(db, token, INVITE)
    return claim, db.get(Customer, claim.customer_id)


def accept_invite(db: Session, token: str, email: str, password: str) -> CustomerUser:
    claim, customer = open_invite(db, token)
    login = _attach_login(db, customer, email, hash_password(password))
    claim.used_at = _now()
    claim.email = email
    create_audit_event(db, AuditAction.CUSTOMER_UPDATED, "customer", customer.id,
                       actor_id=claim.created_by_id, details={"online_account": "invite accepted"},
                       auto_commit=False)
    db.commit()
    db.refresh(login)
    return login


def open_invite_for(db: Session, customer_id: int) -> CustomerAccountClaim | None:
    return (
        db.query(CustomerAccountClaim)
        .filter(CustomerAccountClaim.customer_id == customer_id, CustomerAccountClaim.kind == INVITE,
                CustomerAccountClaim.used_at.is_(None), CustomerAccountClaim.expires_at > _now())
        .order_by(CustomerAccountClaim.id.desc())
        .first()
    )
