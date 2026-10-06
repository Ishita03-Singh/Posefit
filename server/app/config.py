from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="POSEFIT_")

    env: str = "dev"
    cors_origins: list[str] = ["https://localhost:5173"]


settings = Settings()
