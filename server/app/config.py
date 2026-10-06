from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # Reads the repo-root .env (shared with docker-compose) and an optional server/.env.
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"), env_prefix="POSEFIT_", extra="ignore"
    )

    env: str = "dev"
    cors_origins: list[str] = ["https://localhost:5173"]
    # No default: credentials only ever come from the environment / .env (see .env.example).
    database_url: str | None = None
    templates_dir: Path = REPO_ROOT / "shared" / "templates"


settings = Settings()
