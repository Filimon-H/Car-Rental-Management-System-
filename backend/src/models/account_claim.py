"""One-time claims that attach an online login to an existing customer record."""

from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.core.db import Base, UtcDateTime


class CustomerAccountClaim(Base):
    """A pending link between someone signing in online and a customer record.

    A customer created at the counter has no login, and signup refused their
    phone number as already registered. A claim proves they are that customer
    one of two ways:

    - kind "telegram": they signed up on the website and confirm by sharing
      their own phone number with the bot; Telegram vouches for the number.
    - kind "invite": staff, who have seen their ID, give them a one-time link.

    Only a SHA-256 of the token is stored, so a database copy cannot be used
    to take over an account.
    """

    __tablename__ = "customer_account_claims"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # Telegram claims carry the login the person chose at signup.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    # Set when the person opens the bot from the claim's link.
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), server_default=func.now(), nullable=False)
