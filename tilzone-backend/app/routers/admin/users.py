from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database import get_db
from app.models.user import User
from app.routers.admin.deps import require_admin

router = APIRouter()


class UserAdminUpdate(BaseModel):
    name: str | None = None
    username: str | None = None
    email: EmailStr | None = None
    role: str | None = None          # "user" | "admin"
    is_active: bool | None = None
    is_verified: bool | None = None
    xp: int | None = None
    coins: int | None = None
    league: str | None = None
    new_password: str | None = None  # optional password reset


class UserAdminCreate(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str
    role: str = "user"
    native_language: str = "ky"
    study_language: str = "en"


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    role: str | None = Query(None),
    is_active: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(User)
    if search:
        like = f"%{search}%"
        q = q.where(or_(User.username.ilike(like), User.email.ilike(like), User.name.ilike(like)))
    if role:
        q = q.where(User.role == role)
    if is_active is not None:
        q = q.where(User.is_active.is_(is_active))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    q = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    users = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": u.id,
                "name": u.name,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "xp": u.xp,
                "level": u.level,
                "league": u.league,
                "coins": u.coins,
                "streak": u.streak,
                "elo": u.elo,
                "pvp_wins": u.pvp_wins,
                "pvp_losses": u.pvp_losses,
                "is_active": u.is_active,
                "is_verified": u.is_verified,
                "native_language": u.native_language,
                "study_language": u.study_language,
                "created_at": str(u.created_at),
            }
            for u in users
        ],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserAdminCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    exists_email = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if exists_email:
        raise HTTPException(status_code=400, detail="Email уже занят")
    exists_uname = (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none()
    if exists_uname:
        raise HTTPException(status_code=400, detail="Username уже занят")

    user = User(
        name=payload.name,
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        native_language=payload.native_language,
        study_language=payload.study_language,
        is_verified=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "email": user.email, "role": user.role}


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {
        "id": user.id, "name": user.name, "username": user.username,
        "email": user.email, "role": user.role, "xp": user.xp,
        "level": user.level, "league": user.league, "coins": user.coins,
        "streak": user.streak, "elo": user.elo,
        "pvp_wins": user.pvp_wins, "pvp_losses": user.pvp_losses,
        "is_active": user.is_active, "is_verified": user.is_verified,
        "native_language": user.native_language, "study_language": user.study_language,
        "created_at": str(user.created_at), "updated_at": str(user.updated_at),
    }


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    payload: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if payload.name is not None:
        user.name = payload.name
    if payload.username is not None:
        user.username = payload.username
    if payload.email is not None:
        user.email = payload.email
    if payload.role is not None:
        if payload.role not in ("user", "admin"):
            raise HTTPException(status_code=400, detail="Роль должна быть 'user' или 'admin'")
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_verified is not None:
        user.is_verified = payload.is_verified
    if payload.xp is not None:
        user.xp = payload.xp
    if payload.coins is not None:
        user.coins = payload.coins
    if payload.league is not None:
        user.league = payload.league
    if payload.new_password is not None:
        user.hashed_password = hash_password(payload.new_password)

    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role, "is_active": user.is_active}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    await db.delete(user)
    await db.commit()