from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import sqlite3

from app.schemas.matching import NeteaseTrackCandidate


@dataclass(frozen=True)
class TrackMappingRecord:
    source_platform: str
    source_track_id: str
    candidate: NeteaseTrackCandidate
    match_status: str
    confidence: float
    updated_at: str


class TrackMappingRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path

    def get_mapping(
        self, source_platform: str, source_track_id: str
    ) -> TrackMappingRecord | None:
        self._ensure_schema()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM track_mappings
                WHERE source_platform = ? AND source_track_id = ?
                """,
                (source_platform, source_track_id),
            ).fetchone()

        return mapping_from_row(row) if row else None

    def save_mapping(
        self,
        source_platform: str,
        source_track_id: str,
        candidate: NeteaseTrackCandidate,
        match_status: str,
        confidence: float,
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO track_mappings (
                    source_platform, source_track_id, netease_song_id, title,
                    artists_text, album, duration_ms, match_status,
                    confidence, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_platform, source_track_id) DO UPDATE SET
                    netease_song_id = excluded.netease_song_id,
                    title = excluded.title,
                    artists_text = excluded.artists_text,
                    album = excluded.album,
                    duration_ms = excluded.duration_ms,
                    match_status = excluded.match_status,
                    confidence = excluded.confidence,
                    updated_at = excluded.updated_at
                """,
                mapping_values(
                    source_platform,
                    source_track_id,
                    candidate,
                    match_status,
                    confidence,
                ),
            )

    def _ensure_schema(self) -> None:
        db_path = Path(self.database_path)
        if db_path.parent != Path("."):
            db_path.parent.mkdir(parents=True, exist_ok=True)

        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS track_mappings (
                    source_platform TEXT NOT NULL,
                    source_track_id TEXT NOT NULL,
                    netease_song_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    artists_text TEXT NOT NULL,
                    album TEXT,
                    duration_ms INTEGER,
                    match_status TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (source_platform, source_track_id)
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection


def mapping_values(
    source_platform: str,
    source_track_id: str,
    candidate: NeteaseTrackCandidate,
    match_status: str,
    confidence: float,
) -> tuple[object, ...]:
    return (
        source_platform,
        source_track_id,
        candidate.netease_song_id,
        candidate.title,
        "\n".join(candidate.artists),
        candidate.album,
        candidate.duration_ms,
        match_status,
        confidence,
        datetime.now(UTC).isoformat(),
    )


def mapping_from_row(row: sqlite3.Row) -> TrackMappingRecord:
    confidence = float(row["confidence"])
    candidate = NeteaseTrackCandidate(
        netease_song_id=str(row["netease_song_id"]),
        title=str(row["title"]),
        artists=str(row["artists_text"]).split("\n"),
        album=row["album"],
        duration_ms=row["duration_ms"],
        score=confidence,
        reason="mapping_cache_hit",
    )
    return TrackMappingRecord(
        source_platform=str(row["source_platform"]),
        source_track_id=str(row["source_track_id"]),
        candidate=candidate,
        match_status=str(row["match_status"]),
        confidence=confidence,
        updated_at=str(row["updated_at"]),
    )
