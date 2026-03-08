from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str

    # JWT
    jwt_secret: str
    jwt_refresh_secret: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Application
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"

    # Encryption (for SMTP password storage)
    encryption_key: str

    # File Upload
    upload_dir: str = "uploads"
    max_file_size_mb: int = 10

    # AI
    anthropic_api_key: Optional[str] = None

    # Rate Limiting
    rate_limit_requests: int = 10
    rate_limit_window: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
