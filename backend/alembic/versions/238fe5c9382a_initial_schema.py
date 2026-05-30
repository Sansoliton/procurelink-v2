"""initial_schema

Revision ID: 238fe5c9382a
Revises:
Create Date: 2026-05-02 22:48:06.007030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '238fe5c9382a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create all tables from SQLAlchemy models (checkfirst avoids errors on re-runs)
    from app.database import Base, engine  # noqa
    Base.metadata.create_all(bind=engine, checkfirst=True)


def downgrade() -> None:
    from app.database import Base, engine  # noqa
    Base.metadata.drop_all(bind=engine)
