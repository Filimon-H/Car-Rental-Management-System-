"""Add telegram_customer_links table

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telegram_customer_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_user_id", sa.Integer(), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("telegram_username", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["customer_user_id"], ["customer_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_telegram_customer_links_customer_user_id", "telegram_customer_links", ["customer_user_id"], unique=True)
    op.create_index("ix_telegram_customer_links_telegram_user_id", "telegram_customer_links", ["telegram_user_id"], unique=True)
    op.create_index("ix_telegram_customer_links_chat_id", "telegram_customer_links", ["chat_id"], unique=True)

    op.create_table(
        "telegram_customer_link_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_user_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["customer_user_id"], ["customer_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_telegram_customer_link_codes_customer_user_id", "telegram_customer_link_codes", ["customer_user_id"])
    op.create_index("ix_telegram_customer_link_codes_code", "telegram_customer_link_codes", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_telegram_customer_link_codes_code", table_name="telegram_customer_link_codes")
    op.drop_index("ix_telegram_customer_link_codes_customer_user_id", table_name="telegram_customer_link_codes")
    op.drop_table("telegram_customer_link_codes")

    op.drop_index("ix_telegram_customer_links_chat_id", table_name="telegram_customer_links")
    op.drop_index("ix_telegram_customer_links_telegram_user_id", table_name="telegram_customer_links")
    op.drop_index("ix_telegram_customer_links_customer_user_id", table_name="telegram_customer_links")
    op.drop_table("telegram_customer_links")
