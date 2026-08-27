from datetime import UTC, datetime
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from app.repositories.orchestration_records import create_orchestration_tables
from app.schemas.matching import MatchTracksResponse, MatchedTrackItem


class OrchestrationRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path

    def create_orchestration(self, session_id: str, status: str) -> None:
        self._ensure_schema()
        timestamp = now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO import_orchestrations (
                    session_id, status, read_count, read_total, matched_count,
                    match_total, synced_count, sync_total, created_at, updated_at
                )
                VALUES (?, ?, 0, 0, 0, 0, 0, 0, ?, ?)
                """,
                (session_id, status, timestamp, timestamp),
            )

    def mark_status(self, session_id: str, status: str) -> None:
        self._update_orchestration(
            session_id,
            "status = ?, failed_stage = NULL, error_code = NULL, error_message = NULL",
            (status,),
        )

    def mark_failed(
        self,
        session_id: str,
        stage: str,
        code: str,
        message: str,
    ) -> None:
        self._update_orchestration(
            session_id,
            "status = ?, failed_stage = ?, error_code = ?, error_message = ?",
            ("failed", stage, code, message),
        )

    def mark_matching(self, session_id: str, total: int) -> None:
        self._update_orchestration(
            session_id,
            "status = ?, matched_count = 0, match_total = ?",
            ("matching", total),
        )

    def increment_matched(self, session_id: str) -> None:
        self._update_orchestration(
            session_id,
            "matched_count = matched_count + 1",
            (),
        )

    def save_match_result(self, session_id: str, result: MatchTracksResponse) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM orchestration_matched_tracks WHERE session_id = ?",
                (session_id,),
            )
            for index, track in enumerate(result.tracks):
                connection.execute(
                    """
                    INSERT INTO orchestration_matched_tracks (
                        session_id, matched_index, payload_json
                    )
                    VALUES (?, ?, ?)
                    """,
                    (
                        session_id,
                        index,
                        json.dumps(track.model_dump(mode="json"), ensure_ascii=False),
                    ),
                )
            connection.execute(
                """
                UPDATE import_orchestrations
                SET matched_count = ?, match_total = ?, updated_at = ?
                WHERE session_id = ?
                """,
                (
                    result.total_track_count,
                    result.total_track_count,
                    now(),
                    session_id,
                ),
            )

    def mark_syncing(self, session_id: str, total: int) -> None:
        self._update_orchestration(
            session_id,
            "status = ?, synced_count = 0, sync_total = ?",
            ("syncing_temp", total),
        )

    def mark_ready(
        self,
        session_id: str,
        temp_playlist_id: str,
        synced_count: int,
        sync_total: int,
    ) -> None:
        timestamp = now()
        self._update_orchestration(
            session_id,
            """
            status = ?, temp_playlist_id = ?, synced_count = ?, sync_total = ?,
            ready_to_play_at = ?
            """,
            ("ready_to_play", temp_playlist_id, synced_count, sync_total, timestamp),
        )

    def create_analytics_job(self, session_id: str) -> str:
        self._ensure_schema()
        job_id = str(uuid4())
        timestamp = now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO analytics_jobs (
                    id, import_session_id, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (job_id, session_id, "pending", timestamp, timestamp),
            )
            connection.execute(
                """
                UPDATE import_orchestrations
                SET analytics_job_id = ?, updated_at = ?
                WHERE session_id = ?
                """,
                (job_id, timestamp, session_id),
            )
        return job_id

    def mark_analytics_status(
        self,
        job_id: str,
        status: str,
        error_message: str | None = None,
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE analytics_jobs
                SET status = ?, error_message = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, error_message, now(), job_id),
            )

    def save_analytics_result(
        self,
        job_id: str,
        session_id: str,
        metric_key: str,
        payload: dict,
        status: str = "completed",
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO analytics_results (
                    job_id, import_session_id, metric_key, payload_json,
                    status, computed_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id, metric_key) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    status = excluded.status,
                    computed_at = excluded.computed_at
                """,
                (
                    job_id,
                    session_id,
                    metric_key,
                    json.dumps(payload, ensure_ascii=False),
                    status,
                    now(),
                ),
            )

    def list_matched_tracks(self, session_id: str) -> list[MatchedTrackItem]:
        self._ensure_schema()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM orchestration_matched_tracks
                WHERE session_id = ?
                ORDER BY matched_index ASC
                """,
                (session_id,),
            ).fetchall()
        return [
            MatchedTrackItem.model_validate(json.loads(str(row["payload_json"])))
            for row in rows
        ]

    def replace_matched_track(
        self,
        session_id: str,
        confirmed: MatchedTrackItem,
    ) -> None:
        tracks = self.list_matched_tracks(session_id)
        if not tracks:
            return
        requested = set(confirmed.source_track_ids)
        next_tracks = [
            confirmed
            if requested.issubset(set(track.source_track_ids))
            else track
            for track in tracks
        ]
        self.save_match_result(
            session_id,
            MatchTracksResponse(
                import_session_id=session_id,
                total_track_count=len(next_tracks),
                auto_matched_count=count_status(next_tracks, "auto_accepted"),
                needs_confirm_count=count_status(next_tracks, "needs_confirm"),
                no_match_count=count_status(next_tracks, "no_match"),
                tracks=next_tracks,
            ),
        )

    def get_failed_stage(self, session_id: str) -> str | None:
        self._ensure_schema()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT failed_stage FROM import_orchestrations WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return row["failed_stage"]

    def has_orchestration(self, session_id: str) -> bool:
        self._ensure_schema()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM import_orchestrations WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return row is not None

    def _update_orchestration(
        self,
        session_id: str,
        assignments: str,
        params: tuple[object, ...],
    ) -> None:
        self._ensure_schema()
        with self._connect() as connection:
            connection.execute(
                f"""
                UPDATE import_orchestrations
                SET {assignments}, updated_at = ?
                WHERE session_id = ?
                """,
                (*params, now(), session_id),
            )

    def _ensure_schema(self) -> None:
        db_path = Path(self.database_path)
        if db_path.parent != Path("."):
            db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            create_orchestration_tables(connection)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection


def now() -> str:
    return datetime.now(UTC).isoformat()


def count_status(items: list[MatchedTrackItem], status: str) -> int:
    return sum(1 for item in items if item.match_status == status)
