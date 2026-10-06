from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="POSEFIT_")

    env: str = "dev"
    cors_origins: list[str] = ["https://localhost:5173"]
    # Local dev database from docker-compose.yml (credentials are dev-only).
    database_url: str = "postgresql://posefit:REDACTED@localhost:5433/posefit"
    templates_dir: Path = REPO_ROOT / "shared" / "templates"


settings = Settings()
