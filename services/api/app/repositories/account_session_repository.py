from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path
import sqlite3

from app.schemas.account import NeteaseAccountProfile


@dataclass(frozen=True)
class AccountSessionRecord:
    provider: str
    cookies: dict[str, str]
    profile: NeteaseAccountProfile
    updated_at: datetime


class AccountSessionRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path

    def get_netease_session(self) -> AccountSessionRecord | None:
        self._ensure_schema()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT provider, cookies_json, user_id, nickname, avatar_url, updated_at
                FROM account_sessions
                WHERE provider = ?
                """,
                ("netease",),
            ).fetchone()

        if row is None:
            return None

        profile = NeteaseAccountProfile(
            user_id=str(row["user_id"]),
            nickname=str(row["nickname"]),
            avatar_url=row["avatar_url"],
        )
        return AccountSessionRecord(
            provider=str(row["provider"]),
            cookies=json.loads(str(row["cookies_json"])),
            profile=profile,
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )

    def save_netease_session(
        self,
        cookies: dict[str, str],
        profile: NeteaseAccountProfile,
        updated_at: datetime | None = None,
    ) -> None:
        self._ensure_schema()
        timestamp = updated_at or datetime.now(UTC)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO account_sessions (
                    provider, cookies_json, user_id, nickname, avatar_url, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider) DO UPDATE SET
                    cookies_json = excluded.cookies_json,
                    user_id = excluded.user_id,
                    nickname = excluded.nickname,
                    avatar_url = excluded.avatar_url,
                    updated_at = excluded.updated_at
                """,
                (
                    "netease",
                    json.dumps(cookies, ensure_ascii=False, sort_keys=True),
                    profile.user_id,
                    profile.nickname,
                    profile.avatar_url,
                    timestamp.isoformat(),
                ),
            )

    def clear_netease_session(self) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM account_sessions WHERE provider = ?",
                ("netease",),
            )

    def _ensure_schema(self) -> None:
        db_path = Path(self.database_path)
        if db_path.parent != Path("."):
            db_path.parent.mkdir(parents=True, exist_ok=True)

        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS account_sessions (
                    provider TEXT PRIMARY KEY,
                    cookies_json TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    nickname TEXT NOT NULL,
                    avatar_url TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection
