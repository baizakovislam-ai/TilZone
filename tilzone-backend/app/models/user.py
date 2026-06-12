import secrets

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: secrets.token_hex(16),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    avatar: Mapped[str | None] = mapped_column(String(500), nullable=True)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    league: Mapped[str] = mapped_column(String(50), default="Bronze", nullable=False)
    coins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    pvp_wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pvp_losses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    elo: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)

    native_language: Mapped[str] = mapped_column(String(10), default="ky", nullable=False)
    study_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    verification_code: Mapped[str | None] = mapped_column(String(6), nullable=True)
    reset_token: Mapped[str | None] = mapped_column(String(128), nullable=True)

    login_code: Mapped[str | None] = mapped_column(String(6), nullable=True)
    login_code_exp: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
