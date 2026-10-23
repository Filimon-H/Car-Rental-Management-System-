"""Add customer_account_claims

Revision ID: n9b0c1d2e3f4
Revises: m8a9b0c1d2e3
Create Date: 2026-10-21

One-time claims that attach an online login to a customer created at the
counter: confirmed through the Telegram bot, or by a staff invite link.
"""
import sqlalchemy as sa
from alembic import op
# alembic/ is a script directory, not an importable package, so load the shared
# migration helpers by path.
import importlib.util as _ilu, pathlib as _pl
_spec = _ilu.spec_from_file_location(
    "migration_helpers", _pl.Path(__file__).resolve().parents[1] / "migration_helpers.py"
)
_mh = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mh)

revision = "n9b0c1d2e3f4"
down_revision = "m8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if _mh.table_exists("customer_account_claims"):
        return
    op.create_table(
        "customer_account_claims",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_customer_account_claims_customer_id", "customer_account_claims", ["customer_id"])
    op.create_index("ix_customer_account_claims_token_hash", "customer_account_claims", ["token_hash"], unique=True)
    op.create_index("ix_customer_account_claims_telegram_user_id", "customer_account_claims", ["telegram_user_id"])


def downgrade() -> None:
    op.drop_table("customer_account_claims")
