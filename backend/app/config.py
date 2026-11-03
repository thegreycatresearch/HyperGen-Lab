from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "HYPERGEN LAB"
    database_url: str = "sqlite:///./data/hypergen_lab.sqlite3"
    ncbi_email: str = ""
    ncbi_tool: str = "hypergen_lab"
    cache_ttl_seconds: int = 86_400
    frontend_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def ensure_sqlite_parent(database_url: str) -> None:
    prefix = "sqlite:///"
    if database_url.startswith(prefix):
        database_path = database_url.removeprefix(prefix)
        if database_path != ":memory:" and not database_path.startswith("file:"):
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)
