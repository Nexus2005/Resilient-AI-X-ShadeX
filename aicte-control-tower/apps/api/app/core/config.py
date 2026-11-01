from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_name: str = "AICTE Control Tower"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://aicte:aicte@db:5432/aicte"
    jwt_secret: str = "dev-only-secret-change-before-deploy-32b"
    web_origin: str = "http://localhost:3000"

    demo_mode: bool = True

    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_from: str = "no-reply@control-tower.local"
    sms_provider: str = "simulated"

    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_model: str = ""

    storage_dir: str = "/data/files"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
