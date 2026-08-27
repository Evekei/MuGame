from dataclasses import dataclass
import json
import sqlite3

from app.repositories.orchestration_records import (
    analytics_metric_from_row,
    create_orchestration_tables,
    matched_track_from_row,
    playback_payload,
)
from app.schemas.imports import (
    ConfirmedSourcePlaylist,
    ImportProgress,
    ImportSessionResponse,
    ImportStageProgress,
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
            source_tags_json TEXT NOT NULL DEFAULT '[]',
            track_count INTEGER,
            import_track_limit INTEGER,
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
    ensure_column(
        connection,
        "source_playlists",
        "source_tags_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )
    ensure_column(connection, "source_playlists", "import_track_limit", "INTEGER")
    ensure_column(connection, "source_tracks", "owner_avatar_url", "TEXT")
    create_orchestration_tables(connection)


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
        source_tags=json.loads(str(row["source_tags_json"] or "[]")),
        track_count=row["track_count"],
        import_track_limit=row["import_track_limit"],
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
    orchestration: sqlite3.Row | None = None,
    matched_rows: list[sqlite3.Row] | None = None,
    analytics_job: sqlite3.Row | None = None,
    analytics_rows: list[sqlite3.Row] | None = None,
) -> ImportSessionResponse:
    matched_tracks = [
        matched_track_from_row(row) for row in (matched_rows or [])
    ]
    error = None
    if orchestration is not None and orchestration["error_code"]:
        error = PlaylistPreviewError(
            code=str(orchestration["error_code"]),
            message=str(orchestration["error_message"] or ""),
        )
    progress = import_progress(orchestration, source_rows)
    return ImportSessionResponse(
        id=str(session["id"]),
        status=str(orchestration["status"]) if orchestration is not None else str(session["status"]),
        raw_track_count=int(session["raw_track_count"]),
        source_playlists=[source_result_from_row(row) for row in source_rows],
        tracks=[track_from_row(row) for row in track_rows],
        created_at=str(session["created_at"]),
        updated_at=str(session["updated_at"]),
        failed_stage=str(orchestration["failed_stage"]) if orchestration is not None and orchestration["failed_stage"] else None,
        error=error,
        progress=progress,
        temp_playlist_id=str(orchestration["temp_playlist_id"]) if orchestration is not None and orchestration["temp_playlist_id"] else None,
        ready_to_play_at=str(orchestration["ready_to_play_at"]) if orchestration is not None and orchestration["ready_to_play_at"] else None,
        analytics_job_id=str(orchestration["analytics_job_id"]) if orchestration is not None and orchestration["analytics_job_id"] else None,
        analytics_status=str(analytics_job["status"]) if analytics_job is not None else None,
        analytics_results=[
            analytics_metric_from_row(row) for row in (analytics_rows or [])
        ],
        matched_tracks=matched_tracks,
        playback=playback_payload(orchestration, matched_tracks),
    )


def import_progress(
    orchestration: sqlite3.Row | None,
    source_rows: list[sqlite3.Row],
) -> ImportProgress | None:
    if orchestration is None:
        return None
    read_total = 0
    read_count = 0
    for row in source_rows:
        read_total += effective_read_total(row)
        read_count += int(row["read_count"])
    return ImportProgress(
        read=ImportStageProgress(current=read_count, total=read_total),
        match=ImportStageProgress(
            current=int(orchestration["matched_count"]),
            total=int(orchestration["match_total"]),
        ),
        sync=ImportStageProgress(
            current=int(orchestration["synced_count"]),
            total=int(orchestration["sync_total"]),
        ),
    )


def playlist_row_id(session_id: str, source: ConfirmedSourcePlaylist) -> str:
    return f"{session_id}:{source.platform}:{source.source_playlist_id}"


def effective_read_total(row: sqlite3.Row) -> int:
    track_count = row["track_count"]
    limit = row["import_track_limit"]
    if limit is None:
        return int(track_count) if track_count is not None else int(row["read_count"])
    if str(row["status"]) == "ready":
        return int(row["read_count"])
    if track_count is not None:
        return min(int(track_count), int(limit))
    return int(limit)


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
