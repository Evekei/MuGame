import json
import sqlite3

from app.schemas.imports import AnalyticsMetric, ImportPlaybackPayload
from app.schemas.matching import MatchedTrackItem


def create_orchestration_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS import_orchestrations (
            session_id TEXT PRIMARY KEY REFERENCES import_sessions(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            failed_stage TEXT,
            error_code TEXT,
            error_message TEXT,
            read_count INTEGER NOT NULL DEFAULT 0,
            read_total INTEGER NOT NULL DEFAULT 0,
            matched_count INTEGER NOT NULL DEFAULT 0,
            match_total INTEGER NOT NULL DEFAULT 0,
            synced_count INTEGER NOT NULL DEFAULT 0,
            sync_total INTEGER NOT NULL DEFAULT 0,
            temp_playlist_id TEXT,
            ready_to_play_at TEXT,
            analytics_job_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS orchestration_matched_tracks (
            session_id TEXT NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            matched_index INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (session_id, matched_index)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS analytics_jobs (
            id TEXT PRIMARY KEY,
            import_session_id TEXT NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS analytics_results (
            job_id TEXT NOT NULL REFERENCES analytics_jobs(id) ON DELETE CASCADE,
            import_session_id TEXT NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            metric_key TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL,
            computed_at TEXT NOT NULL,
            PRIMARY KEY (job_id, metric_key)
        )
        """
    )


def matched_track_from_row(row: sqlite3.Row) -> MatchedTrackItem:
    return MatchedTrackItem.model_validate(json.loads(str(row["payload_json"])))


def analytics_metric_from_row(row: sqlite3.Row) -> AnalyticsMetric:
    return AnalyticsMetric(
        metric_key=str(row["metric_key"]),
        payload=json.loads(str(row["payload_json"])),
        status=str(row["status"]),
        computed_at=str(row["computed_at"]),
    )


def playback_payload(
    orchestration: sqlite3.Row | None,
    matched_tracks: list[MatchedTrackItem],
) -> ImportPlaybackPayload | None:
    if orchestration is None or str(orchestration["status"]) != "ready_to_play":
        return None
    temp_playlist_id = orchestration["temp_playlist_id"]
    if not temp_playlist_id:
        return None
    return ImportPlaybackPayload(
        temp_playlist_id=str(temp_playlist_id),
        tracks=matched_tracks,
    )
