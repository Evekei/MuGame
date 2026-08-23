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
    playlist_preview_timeout_seconds: float
    match_auto_accept_score: float
    match_need_confirm_score: float
    match_concurrency_limit: int
    temp_playlist_name: str
    temp_playlist_batch_size: int
    temp_playlist_batch_retry_count: int


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    cors_origins = os.getenv(
        "MUGAME_CORS_ORIGINS",
        "http://localhost:3001,http://127.0.0.1:3001,http://localhost:3000,http://127.0.0.1:3000,https://localhost",
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
        playlist_preview_timeout_seconds=float(
            os.getenv("MUGAME_PLAYLIST_PREVIEW_TIMEOUT_SECONDS", "8")
        ),
        match_auto_accept_score=float(os.getenv("MUGAME_MATCH_AUTO_ACCEPT_SCORE", "0.86")),
        match_need_confirm_score=float(os.getenv("MUGAME_MATCH_NEED_CONFIRM_SCORE", "0.65")),
        match_concurrency_limit=int(os.getenv("MUGAME_MATCH_CONCURRENCY_LIMIT", "3")),
        temp_playlist_name=os.getenv(
            "MUGAME_TEMP_PLAYLIST_NAME",
            "MusicGame · 当前游戏",
        ),
        temp_playlist_batch_size=int(os.getenv("MUGAME_TEMP_PLAYLIST_BATCH_SIZE", "200")),
        temp_playlist_batch_retry_count=int(
            os.getenv("MUGAME_TEMP_PLAYLIST_BATCH_RETRY_COUNT", "1")
        ),
    )
