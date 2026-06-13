from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./procurelink.db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440
    algorithm: str = "HS256"

    # Storage — local filesystem mount path for all uploaded files and PDFs
    upload_dir: str = "/app/uploads"

    # Email
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "noreply@procurelink.io"
    sendgrid_api_key: Optional[str] = None

    # Frontend
    frontend_url: str = "http://localhost:5173"
    # Comma-separated extra allowed CORS origins (e.g. production URL set via ALLOWED_ORIGINS env var)
    allowed_origins: str = ""

    # AI (optional)
    gemini_api_key: Optional[str] = None

    # App
    environment: str = "development"
    debug: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


settings = Settings()
