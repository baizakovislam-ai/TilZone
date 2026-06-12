import base64
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserRead

router = APIRouter()

# Папка для хранения аватаров (создаётся автоматически)
AVATAR_DIR = Path("static/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB


class UserProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    username: str | None = Field(default=None, min_length=3, max_length=50)
    native_language: str | None = Field(default=None, pattern="^(ky|ru|en)$")
    study_language: str | None = Field(default=None, pattern="^(ky|ru|en)$")


@router.get("/profile", response_model=UserRead)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/profile", response_model=UserRead)
async def update_profile(
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)

    # Check username uniqueness
    if "username" in data and data["username"] != current_user.username:
        result = await db.execute(select(User).where(User.username == data["username"]))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "username_exists",
                        "message": "Username уже занят",
                        "details": {"username": "already taken"},
                    }
                },
            )

    for key, value in data.items():
        setattr(current_user, key, value)

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/avatar", response_model=UserRead)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Загружает аватар пользователя.
    Принимает: image/jpeg, image/png, image/webp, image/gif — до 5 MB.
    Возвращает обновлённый профиль с полем avatar (URL).
    """
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "code": "invalid_file_type",
                    "message": f"Допустимые форматы: {', '.join(ALLOWED_IMAGE_TYPES)}",
                    "details": {},
                }
            },
        )

    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "code": "file_too_large",
                    "message": "Максимальный размер файла — 5 MB",
                    "details": {},
                }
            },
        )

    # Delete old avatar file if it exists locally
    if current_user.avatar and current_user.avatar.startswith("/static/avatars/"):
        old_path = Path(current_user.avatar.lstrip("/"))
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    # Save new file
    filename_original = file.filename or ""

    ext = (
        filename_original.rsplit(".", 1)[-1].lower()
        if "." in filename_original
        else "jpg"
    )
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    save_path = AVATAR_DIR / filename

    with open(save_path, "wb") as f:
        f.write(contents)

    current_user.avatar = f"/static/avatars/{filename}"
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.delete("/avatar", response_model=UserRead)
async def delete_avatar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.avatar and current_user.avatar.startswith("/static/avatars/"):
        old_path = Path(current_user.avatar.lstrip("/"))
        old_path.unlink(missing_ok=True)

    current_user.avatar = None
    await db.commit()
    await db.refresh(current_user)
    return current_user