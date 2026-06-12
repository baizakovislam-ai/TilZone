import random
import secrets

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin


async def get_user_by_email_or_username(
    db: AsyncSession,
    login: str,
) -> User | None:
    stmt = select(User).where(or_(User.email == login, User.username == login))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_email(
    db: AsyncSession,
    email: str,
) -> User | None:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_username(
    db: AsyncSession,
    username: str,
) -> User | None:
    stmt = select(User).where(User.username == username)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    payload: UserCreate,
) -> User:
    user = User(
        name=payload.name,
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        native_language=payload.native_language,
        study_language=payload.study_language,
        verification_code=generate_verification_code(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(
    db: AsyncSession,
    payload: UserLogin,
) -> User | None:
    user = await get_user_by_email_or_username(db, payload.login)
    if not user:
        return None

    if not verify_password(payload.password, user.hashed_password):
        return None

    return user


def build_token_pair(user: User) -> dict:
    token_data = {"sub": user.id, "email": user.email, "role": user.role}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "Bearer",
    }


def generate_verification_code() -> str:
    return f"{random.randint(100000, 999999)}"


def generate_reset_token() -> str:
    return secrets.token_urlsafe(48)
