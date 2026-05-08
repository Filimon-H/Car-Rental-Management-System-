"""Add vendor_payments table

Revision ID: b2a7c6d4ef91
Revises: 9b1f3f8d2c11
Create Date: 2026-04-03

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2a7c6d4ef91'
down_revision: Union[str, None] = '9b1f3f8d2c11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vendor_payments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('vendor_id', sa.Integer(), nullable=False),
        sa.Column('agreement_id', sa.Integer(), nullable=True),
        sa.Column(
            'amount',
            sa.Numeric(precision=12, scale=2),
            nullable=False,
        ),
        sa.Column(
            'payment_method',
            sa.Enum(
                'CASH',
                'BANK_TRANSFER',
                'TELEBIRR',
                'CBE_BIRR',
                'CHECK',
                'OTHER',
                name='paymentmethod',
            ),
            nullable=False,
        ),
        sa.Column('payment_reference', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['agreement_id'], ['agreements.id']),
        sa.ForeignKeyConstraint(['created_by_id'], ['staff_users.id']),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendor_payments_vendor_id'), 'vendor_payments', ['vendor_id'], unique=False)
    op.create_index(op.f('ix_vendor_payments_agreement_id'), 'vendor_payments', ['agreement_id'], unique=False)
    op.create_index(op.f('ix_vendor_payments_created_at'), 'vendor_payments', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_vendor_payments_created_at'), table_name='vendor_payments')
    op.drop_index(op.f('ix_vendor_payments_agreement_id'), table_name='vendor_payments')
    op.drop_index(op.f('ix_vendor_payments_vendor_id'), table_name='vendor_payments')
    op.drop_table('vendor_payments')
