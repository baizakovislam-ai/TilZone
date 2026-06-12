from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "Bearer"


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)
    native_language: str = Field(default="ky", pattern="^(ky|ru|en)$")
    study_language: str = Field(default="en", pattern="^(ky|ru|en)$")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Aibek",
                "username": "aibek_learner",
                "email": "aibek@example.com",
                "password": "securePass123",
                "password_confirmation": "securePass123",
                "native_language": "ky",
                "study_language": "en",
            }
        }
    )


class UserLogin(BaseModel):
    """
    login — может быть email или username.
    Фронтенд должен отправлять поле `login`, не `email`.
    """

    login: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    id: str
    name: str
    username: str
    email: EmailStr
    avatar: str | None = None
    xp: int
    streak: int
    level: int
    league: str
    coins: int
    pvp_wins: int
    pvp_losses: int
    elo: int
    native_language: str
    study_language: str
    role: str
    is_verified: bool

    model_config = ConfigDict(from_attributes=True)


class EmailVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=1)
