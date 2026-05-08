"""Add collateral_documents table

Revision ID: 9b1f3f8d2c11
Revises: 4d32881164b2
Create Date: 2026-01-03

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b1f3f8d2c11'
down_revision: Union[str, None] = '4d32881164b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'collateral_documents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('collateral_id', sa.Integer(), nullable=False),
        sa.Column(
            'doc_type',
            sa.Enum('PASSPORT', 'NATIONAL_ID', 'KEBELE_ID', 'DRIVER_LICENSE', name='documenttype'),
            nullable=False,
        ),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('uploaded_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['collateral_id'], ['collateral_persons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['staff_users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_collateral_documents_collateral_id'), 'collateral_documents', ['collateral_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_collateral_documents_collateral_id'), table_name='collateral_documents')
    op.drop_table('collateral_documents')
