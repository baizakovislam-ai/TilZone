from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AIChat(Base):
    __tablename__ = "ai_chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    scenario: Mapped[str] = mapped_column(String(80), default="general", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PvPMatch(Base):
    __tablename__ = "pvp_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    match_type: Mapped[str] = mapped_column(String(50), default="1v1", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="waiting", nullable=False)
    winner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class XPHistory(Base):
    __tablename__ = "xp_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
