"""Add Telegram staff link tables

Revision ID: c4a2f9d5b781
Revises: b2a7c6d4ef91
Create Date: 2026-04-03

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4a2f9d5b781"
down_revision: Union[str, None] = "b2a7c6d4ef91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "telegram_staff_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("staff_user_id", sa.Integer(), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("telegram_username", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["staff_user_id"], ["staff_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_telegram_staff_links_staff_user_id"),
        "telegram_staff_links",
        ["staff_user_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_telegram_staff_links_telegram_user_id"),
        "telegram_staff_links",
        ["telegram_user_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_telegram_staff_links_chat_id"),
        "telegram_staff_links",
        ["chat_id"],
        unique=True,
    )

    op.create_table(
        "telegram_link_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("staff_user_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["staff_user_id"], ["staff_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_telegram_link_codes_staff_user_id"),
        "telegram_link_codes",
        ["staff_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_telegram_link_codes_code"),
        "telegram_link_codes",
        ["code"],
        unique=True,
    )
    op.create_index(
        op.f("ix_telegram_link_codes_expires_at"),
        "telegram_link_codes",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_telegram_link_codes_expires_at"), table_name="telegram_link_codes")
    op.drop_index(op.f("ix_telegram_link_codes_code"), table_name="telegram_link_codes")
    op.drop_index(op.f("ix_telegram_link_codes_staff_user_id"), table_name="telegram_link_codes")
    op.drop_table("telegram_link_codes")

    op.drop_index(op.f("ix_telegram_staff_links_chat_id"), table_name="telegram_staff_links")
    op.drop_index(op.f("ix_telegram_staff_links_telegram_user_id"), table_name="telegram_staff_links")
    op.drop_index(op.f("ix_telegram_staff_links_staff_user_id"), table_name="telegram_staff_links")
    op.drop_table("telegram_staff_links")
