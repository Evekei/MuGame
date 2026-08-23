from datetime import UTC, datetime
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
                        cover_url, track_count, status, read_count
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        source.track_count,
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

        return import_session_from_rows(session, source_rows, track_rows)

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
