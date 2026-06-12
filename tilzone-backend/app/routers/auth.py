from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    EmailVerifyRequest,
    ForgotPasswordRequest,
    RefreshTokenRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserRead,
)
from app.services.auth import (
    authenticate_user,
    build_token_pair,
    create_user,
    generate_verification_code,
    generate_reset_token,
    get_user_by_email,
    get_user_by_username,
)
from app.services.email import EmailDeliveryError, send_password_reset, send_verification_code

router = APIRouter()


def api_error(
    status_code: int,
    code: str,
    message: str,
    details: dict | None = None,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message, "details": details or {}}},
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    if payload.password != payload.password_confirmation:
        raise api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "validation_failed",
            "Пароли не совпадают",
            {"password_confirmation": "must match password"},
        )

    if await get_user_by_email(db, payload.email):
        raise api_error(status.HTTP_400_BAD_REQUEST, "email_exists", "Email уже зарегистрирован")

    if await get_user_by_username(db, payload.username):
        raise api_error(status.HTTP_400_BAD_REQUEST, "username_exists", "Username уже занят")

    user = await create_user(db, payload)

    try:
        send_verification_code(user.email, user.verification_code or "")
    except EmailDeliveryError as exc:
        await db.delete(user)
        await db.commit()
        raise api_error(
            status.HTTP_502_BAD_GATEWAY,
            "smtp_failed",
            "Не удалось отправить email подтверждения",
            {"smtp": str(exc)},
        )

    return {
    "message": "Код подтверждения отправлен",
    "email": user.email
}


@router.post("/resend-verification")
async def resend_verification(payload: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, payload.email)
    if not user:
        return {"message": "Если аккаунт существует, мы отправили новый код"}

    if user.is_verified:
        raise api_error(status.HTTP_400_BAD_REQUEST, "already_verified", "Email уже подтверждён")

    user.verification_code = generate_verification_code()
    await db.commit()
    await db.refresh(user)

    try:
        send_verification_code(user.email, user.verification_code or "")
    except EmailDeliveryError as exc:
        raise api_error(
            status.HTTP_502_BAD_GATEWAY,
            "smtp_failed",
            "Не удалось отправить email подтверждения",
            {"smtp": str(exc)},
        )

    return {"message": "Код подтверждения отправлен", "email": user.email}


@router.post("/login")
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, payload)
    if not user:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "invalid_credentials",
            "Неверный логин или пароль",
        )
    if not user.is_verified:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "email_not_verified",
            "Сначала подтвердите email"
    )
    return {"user": UserRead.model_validate(user), **build_token_pair(user)}


@router.post("/verify-email")
async def verify_email(payload: EmailVerifyRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, payload.email)
    if not user or user.verification_code != payload.code:
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_code", "Неверный код подтверждения")

    user.is_verified = True
    user.verification_code = None
    await db.commit()
    await db.refresh(user)
    return {
    "verified": True,
    "user": UserRead.model_validate(user),
    **build_token_pair(user)
}


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, payload.email)
    if user:
        token = generate_reset_token()

        user.reset_token = token
        await db.commit()

        try:
            send_password_reset(user.email, token)
        except EmailDeliveryError as exc:
            raise api_error(
                status.HTTP_502_BAD_GATEWAY,
                "smtp_failed",
                "Не удалось отправить письмо",
                {"smtp": str(exc)},
            )
    # Always return 200 to avoid email enumeration
    return {"message": "Если email существует, мы отправили письмо для сброса пароля"}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if payload.new_password != payload.password_confirmation:
        raise api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "validation_failed",
            "Пароли не совпадают",
            {"password_confirmation": "must match new_password"},
        )

    result = await db.execute(select(User).where(User.reset_token == payload.token))
    user = result.scalar_one_or_none()
    if not user:
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_token", "Неверный токен сброса")

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    await db.commit()
    return {"message": "Пароль обновлён"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshTokenRequest):
    try:
        token_data = decode_token(payload.refresh_token)
    except Exception:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "invalid_refresh_token",
            "Refresh-токен недействителен",
        )

    if token_data.get("type") != "refresh" or not token_data.get("sub"):
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "invalid_refresh_token",
            "Refresh-токен недействителен",
        )

    data = {
        "sub": token_data["sub"],
        "email": token_data.get("email"),
        "role": token_data.get("role"),
    }
    return TokenResponse(
        access_token=create_access_token(data),
        refresh_token=create_refresh_token(data),
        token_type="Bearer",
    )
