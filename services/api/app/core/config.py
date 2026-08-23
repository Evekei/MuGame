import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    app_name: str
    version: str
    cors_origins: list[str]
    database_path: str
    netease_profile_url: str
    netease_request_timeout_seconds: float


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    cors_origins = os.getenv(
        "MUGAME_CORS_ORIGINS",
        "http://localhost:3001,http://127.0.0.1:3001,http://localhost:3000,http://127.0.0.1:3000",
    )
    return Settings(
        app_name=os.getenv("MUGAME_API_NAME", "MuGame API"),
        version=os.getenv("MUGAME_API_VERSION", "0.1.0"),
        cors_origins=_split_csv(cors_origins),
        database_path=os.getenv("MUGAME_DB_PATH", "mugame.sqlite3"),
        netease_profile_url=os.getenv(
            "MUGAME_NETEASE_PROFILE_URL",
            "https://music.163.com/api/nuser/account/get",
        ),
        netease_request_timeout_seconds=float(
            os.getenv("MUGAME_NETEASE_TIMEOUT_SECONDS", "8")
        ),
    )
