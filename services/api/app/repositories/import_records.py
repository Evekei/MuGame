from dataclasses import dataclass
import json
import sqlite3

from app.schemas.imports import (
    ConfirmedSourcePlaylist,
    ImportSessionResponse,
    PlaylistPreviewError,
    SourcePlaylistImportResult,
    SourceTrackItem,
)


@dataclass(frozen=True)
class SourcePlaylistRecord:
    id: str
    import_session_id: str
    source: ConfirmedSourcePlaylist
    status: str
    read_count: int
    error_code: str | None
    error_message: str | None


def create_import_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS import_sessions (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            raw_track_count INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS source_playlists (
            id TEXT PRIMARY KEY,
            import_session_id TEXT NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            source_playlist_id TEXT NOT NULL,
            source_url TEXT NOT NULL,
            title TEXT NOT NULL,
            owner_source_id TEXT NOT NULL,
            owner_nickname TEXT NOT NULL,
            owner_avatar_url TEXT,
            cover_url TEXT,
            track_count INTEGER,
            status TEXT NOT NULL,
            read_count INTEGER NOT NULL DEFAULT 0,
            error_code TEXT,
            error_message TEXT,
            updated_at TEXT
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS source_tracks (
            id TEXT PRIMARY KEY,
            import_session_id TEXT NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            source_playlist_row_id TEXT NOT NULL REFERENCES source_playlists(id) ON DELETE CASCADE,
            platform TEXT NOT NULL DEFAULT '',
            source_track_id TEXT NOT NULL,
            title TEXT NOT NULL,
            artists_json TEXT NOT NULL,
            album TEXT,
            duration_ms INTEGER,
            cover_url TEXT,
            source_playlist_id TEXT NOT NULL,
            owner_source_id TEXT NOT NULL,
            owner_nickname TEXT NOT NULL,
            owner_avatar_url TEXT
        )
        """
    )
    ensure_column(
        connection,
        "source_tracks",
        "platform",
        "TEXT NOT NULL DEFAULT ''",
    )
    ensure_column(connection, "source_tracks", "owner_avatar_url", "TEXT")


def ensure_column(
    connection: sqlite3.Connection, table_name: str, column_name: str, definition: str
) -> None:
    columns = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    if any(str(column["name"]) == column_name for column in columns):
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def source_record_from_row(row: sqlite3.Row) -> SourcePlaylistRecord:
    return SourcePlaylistRecord(
        id=str(row["id"]),
        import_session_id=str(row["import_session_id"]),
        source=source_from_row(row),
        status=str(row["status"]),
        read_count=int(row["read_count"]),
        error_code=row["error_code"],
        error_message=row["error_message"],
    )


def source_result_from_row(row: sqlite3.Row) -> SourcePlaylistImportResult:
    error = None
    if row["error_code"]:
        error = PlaylistPreviewError(
            code=str(row["error_code"]),
            message=str(row["error_message"] or ""),
        )
    return SourcePlaylistImportResult(
        **source_from_row(row).model_dump(),
        id=str(row["id"]),
        status=str(row["status"]),
        read_count=int(row["read_count"]),
        error=error,
    )


def source_from_row(row: sqlite3.Row) -> ConfirmedSourcePlaylist:
    return ConfirmedSourcePlaylist(
        platform=str(row["platform"]),
        canonical_url=str(row["source_url"]),
        source_playlist_id=str(row["source_playlist_id"]),
        title=str(row["title"]),
        owner_source_id=str(row["owner_source_id"]),
        owner_nickname=str(row["owner_nickname"]),
        owner_avatar_url=row["owner_avatar_url"],
        cover_url=row["cover_url"],
        track_count=row["track_count"],
    )


def track_from_row(row: sqlite3.Row) -> SourceTrackItem:
    return SourceTrackItem(
        id=str(row["id"]),
        platform=str(row["platform"] or row["source_platform"]),
        source_track_id=str(row["source_track_id"]),
        title=str(row["title"]),
        artists=json.loads(str(row["artists_json"])),
        album=row["album"],
        duration_ms=row["duration_ms"],
        cover_url=row["cover_url"],
        source_playlist_id=str(row["source_playlist_id"]),
        owner_source_id=str(row["owner_source_id"]),
        owner_nickname=str(row["owner_nickname"]),
        owner_avatar_url=row["owner_avatar_url"],
    )


def source_track_insert_values(
    session_id: str, source_playlist_row_id: str, track: SourceTrackItem
) -> tuple[object, ...]:
    return (
        track.id,
        session_id,
        source_playlist_row_id,
        track.platform,
        track.source_track_id,
        track.title,
        json.dumps(track.artists, ensure_ascii=False),
        track.album,
        track.duration_ms,
        track.cover_url,
        track.source_playlist_id,
        track.owner_source_id,
        track.owner_nickname,
        track.owner_avatar_url,
    )


def import_session_from_rows(
    session: sqlite3.Row,
    source_rows: list[sqlite3.Row],
    track_rows: list[sqlite3.Row],
) -> ImportSessionResponse:
    return ImportSessionResponse(
        id=str(session["id"]),
        status=str(session["status"]),
        raw_track_count=int(session["raw_track_count"]),
        source_playlists=[source_result_from_row(row) for row in source_rows],
        tracks=[track_from_row(row) for row in track_rows],
        created_at=str(session["created_at"]),
        updated_at=str(session["updated_at"]),
    )


def playlist_row_id(session_id: str, source: ConfirmedSourcePlaylist) -> str:
    return f"{session_id}:{source.platform}:{source.source_playlist_id}"


def session_status(source_statuses: list[str]) -> str:
    if not source_statuses:
        return "failed"
    if any(status in {"pending", "reading"} for status in source_statuses):
        return "reading"
    if all(status == "ready" for status in source_statuses):
        return "ready"
    if any(status == "ready" for status in source_statuses):
        return "partial_failed"
    return "failed"
