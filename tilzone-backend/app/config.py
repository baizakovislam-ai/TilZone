from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TilZone API"
    env: str = "dev"
    debug: bool = True

    secret_key: str = "change-me-super-secret-32-chars-min"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/tilzone"

    # Comma-separated origins, e.g. "http://localhost:3000,http://127.0.0.1:5501"
    cors_origins: str = (
        "http://localhost:3000,"
        "http://127.0.0.1:5501,"
        "http://localhost:5501,"
        "http://localhost:5500,"
        "http://127.0.0.1:5500"
    )

    # Anthropic
    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-4-6"
    ai_max_tokens: int = 1024

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@tilzone.local"
    smtp_from_name: str = "TilZone"
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sync_database_url(self) -> str:
        """Synchronous URL for Alembic (strips +asyncpg)."""
        return self.database_url.replace("+asyncpg", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()