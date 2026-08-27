from datetime import UTC, datetime
import json
from pathlib import Path
import sqlite3

from app.repositories.import_records import (
    SourcePlaylistRecord,
    create_import_tables,
    import_session_from_rows,
    playlist_row_id,
    session_status,
    source_record_from_row,
    source_track_insert_values,
)
from app.schemas.imports import (
    ConfirmedSourcePlaylist,
    ImportHistoryItem,
    ImportHistorySourceSummary,
    ImportSessionResponse,
    SourceTrackItem,
)


class ImportRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path

    def create_session(
        self, session_id: str, sources: list[ConfirmedSourcePlaylist]
    ) -> None:
        self._ensure_schema()
        timestamp = datetime.now(UTC).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO import_sessions (id, status, raw_track_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, "pending", 0, timestamp, timestamp),
            )
            for source in sources:
                connection.execute(
                    """
                    INSERT INTO source_playlists (
                        id, import_session_id, platform, source_playlist_id, source_url,
                        title, owner_source_id, owner_nickname, owner_avatar_url,
                        cover_url, source_tags_json, track_count, import_track_limit,
                        status, read_count
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        playlist_row_id(session_id, source),
                        session_id,
                        source.platform,
                        source.source_playlist_id,
                        source.canonical_url,
                        source.title,
                        source.owner_source_id,
                        source.owner_nickname,
                        source.owner_avatar_url,
                        source.cover_url,
                        json.dumps(source.source_tags, ensure_ascii=False),
                        source.track_count,
                        source.import_track_limit,
                        "pending",
                        0,
                    ),
                )

    def list_sources(
        self, session_id: str, statuses: set[str] | None = None
    ) -> list[SourcePlaylistRecord]:
        self._ensure_schema()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM source_playlists
                WHERE import_session_id = ?
                ORDER BY rowid ASC
                """,
                (session_id,),
            ).fetchall()
        records = [source_record_from_row(row) for row in rows]
        if statuses is None:
            return records
        return [record for record in records if record.status in statuses]

    def mark_source_reading(
        self, source_id: str, track_count: int | None, read_count: int = 0
    ) -> None:
        self._update_source(
            source_id,
            "reading",
            read_count,
            track_count=track_count,
            error_code=None,
            error_message=None,
        )

    def save_source_tracks(
        self, session_id: str, source: SourcePlaylistRecord, tracks: list[SourceTrackItem]
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM source_tracks WHERE source_playlist_row_id = ?",
                (source.id,),
            )
            for track in tracks:
                connection.execute(
                    """
                    INSERT INTO source_tracks (
                        id, import_session_id, source_playlist_row_id, platform, source_track_id,
                        title, artists_json, album, duration_ms, cover_url,
                        source_playlist_id, owner_source_id, owner_nickname, owner_avatar_url
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    source_track_insert_values(session_id, source.id, track),
                )
            self._set_source_ready(connection, source.id, len(tracks))
            self._refresh_session(connection, session_id)

    def mark_source_failed(
        self, session_id: str, source_id: str, code: str, message: str
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE source_playlists
                SET status = ?, error_code = ?, error_message = ?, updated_at = ?
                WHERE id = ?
                """,
                ("failed", code, message, datetime.now(UTC).isoformat(), source_id),
            )
            self._refresh_session(connection, session_id)

    def get_session(self, session_id: str) -> ImportSessionResponse:
        self._ensure_schema()
        with self._connect() as connection:
            session = connection.execute(
                "SELECT * FROM import_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
            if session is None:
                raise KeyError(session_id)

            source_rows = connection.execute(
                "SELECT * FROM source_playlists WHERE import_session_id = ? ORDER BY rowid ASC",
                (session_id,),
            ).fetchall()
            track_rows = connection.execute(
                """
                SELECT source_tracks.*, source_playlists.platform AS source_platform
                FROM source_tracks
                JOIN source_playlists ON source_playlists.id = source_playlist_row_id
                WHERE source_tracks.import_session_id = ?
                ORDER BY source_tracks.rowid ASC
                """,
                (session_id,),
            ).fetchall()
            orchestration = connection.execute(
                "SELECT * FROM import_orchestrations WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            matched_rows = connection.execute(
                """
                SELECT *
                FROM orchestration_matched_tracks
                WHERE session_id = ?
                ORDER BY matched_index ASC
                """,
                (session_id,),
            ).fetchall()
            analytics_job = None
            analytics_rows = []
            if orchestration is not None and orchestration["analytics_job_id"]:
                analytics_job = connection.execute(
                    "SELECT * FROM analytics_jobs WHERE id = ?",
                    (orchestration["analytics_job_id"],),
                ).fetchone()
                analytics_rows = connection.execute(
                    """
                    SELECT *
                    FROM analytics_results
                    WHERE job_id = ?
                    ORDER BY metric_key ASC
                    """,
                    (orchestration["analytics_job_id"],),
                ).fetchall()

        return import_session_from_rows(
            session,
            source_rows,
            track_rows,
            orchestration,
            matched_rows,
            analytics_job,
            analytics_rows,
        )

    def list_history(self, limit: int = 20) -> list[ImportHistoryItem]:
        self._ensure_schema()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT import_sessions.id
                FROM import_sessions
                JOIN import_orchestrations
                    ON import_orchestrations.session_id = import_sessions.id
                WHERE import_orchestrations.status = ?
                    AND import_orchestrations.temp_playlist_id IS NOT NULL
                ORDER BY COALESCE(
                    import_orchestrations.ready_to_play_at,
                    import_orchestrations.updated_at
                ) DESC
                LIMIT ?
                """,
                ("ready_to_play", limit),
            ).fetchall()
        return [history_item_from_session(self.get_session(str(row["id"]))) for row in rows]

    def delete_session(self, session_id: str) -> bool:
        self._ensure_schema()
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM import_sessions WHERE id = ?",
                (session_id,),
            )
            return cursor.rowcount > 0

    def _update_source(
        self,
        source_id: str,
        status: str,
        read_count: int,
        track_count: int | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE source_playlists
                SET status = ?, read_count = ?, track_count = COALESCE(?, track_count),
                    error_code = ?, error_message = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    status,
                    read_count,
                    track_count,
                    error_code,
                    error_message,
                    datetime.now(UTC).isoformat(),
                    source_id,
                ),
            )
            session_id = connection.execute(
                "SELECT import_session_id FROM source_playlists WHERE id = ?",
                (source_id,),
            ).fetchone()
            if session_id is not None:
                self._refresh_session(connection, str(session_id["import_session_id"]))

    def _ensure_schema(self) -> None:
        db_path = Path(self.database_path)
        if db_path.parent != Path("."):
            db_path.parent.mkdir(parents=True, exist_ok=True)

        with self._connect() as connection:
            create_import_tables(connection)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _set_source_ready(
        self, connection: sqlite3.Connection, source_id: str, read_count: int
    ) -> None:
        connection.execute(
            """
            UPDATE source_playlists
            SET status = ?, read_count = ?, error_code = NULL,
                error_message = NULL, updated_at = ?
            WHERE id = ?
            """,
            ("ready", read_count, datetime.now(UTC).isoformat(), source_id),
        )

    def _refresh_session(self, connection: sqlite3.Connection, session_id: str) -> None:
        rows = connection.execute(
            "SELECT status, read_count FROM source_playlists WHERE import_session_id = ?",
            (session_id,),
        ).fetchall()
        statuses = [str(row["status"]) for row in rows]
        raw_track_count = sum(int(row["read_count"]) for row in rows if row["status"] == "ready")
        connection.execute(
            """
            UPDATE import_sessions
            SET status = ?, raw_track_count = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                session_status(statuses),
                raw_track_count,
                datetime.now(UTC).isoformat(),
                session_id,
            ),
        )


def history_item_from_session(session: ImportSessionResponse) -> ImportHistoryItem:
    temp_playlist_id = session.temp_playlist_id
    if not temp_playlist_id and session.playback:
        temp_playlist_id = session.playback.temp_playlist_id
    return ImportHistoryItem(
        session_id=session.id,
        ready_to_play_at=session.ready_to_play_at or session.updated_at,
        temp_playlist_id=temp_playlist_id or "",
        playable_track_count=playable_track_count(session),
        source_playlists=[
            ImportHistorySourceSummary(
                platform=source.platform,
                source_playlist_id=source.source_playlist_id,
                title=source.title,
                owner_nickname=source.owner_nickname,
                import_track_limit=source.import_track_limit,
                read_count=source.read_count,
            )
            for source in session.source_playlists
        ],
        owner_nicknames=unique_owner_names(session),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def unique_owner_names(session: ImportSessionResponse) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for source in session.source_playlists:
        if source.owner_nickname not in seen:
            names.append(source.owner_nickname)
            seen.add(source.owner_nickname)
    return names


def playable_track_count(session: ImportSessionResponse) -> int:
    if session.progress:
        return session.progress.sync.total
    return len(session.playback.tracks) if session.playback else 0
