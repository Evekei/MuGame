from collections.abc import Iterable
from hashlib import sha256
from uuid import uuid4
import logging

from app.integrations.playlist_full import FullPlaylistAdapter
from app.repositories.import_repository import ImportRepository, SourcePlaylistRecord
from app.schemas.imports import (
    ConfirmedSourcePlaylist,
    FullImportRequest,
    ImportSessionResponse,
    SourceTrackItem,
)

logger = logging.getLogger(__name__)


class FullImportService:
    def __init__(
        self,
        repository: ImportRepository,
        adapters: dict[str, FullPlaylistAdapter],
    ):
        self.repository = repository
        self.adapters = adapters

    def create_session(self, request: FullImportRequest) -> ImportSessionResponse:
        sources = dedupe_sources(request.source_playlists)
        session_id = str(uuid4())
        self.repository.create_session(session_id, sources)
        return self.repository.get_session(session_id)

    def get_session(self, session_id: str) -> ImportSessionResponse:
        return self.repository.get_session(session_id)

    def run_import(self, session_id: str) -> None:
        self._run_sources(
            session_id,
            self.repository.list_sources(session_id, {"pending", "failed"}),
        )

    def retry_failed(self, session_id: str) -> ImportSessionResponse:
        self._run_sources(session_id, self.repository.list_sources(session_id, {"failed"}))
        return self.repository.get_session(session_id)

    def _run_sources(
        self, session_id: str, sources: Iterable[SourcePlaylistRecord]
    ) -> None:
        for source in sources:
            self._run_source(session_id, source)

    def _run_source(self, session_id: str, source: SourcePlaylistRecord) -> None:
        adapter = self.adapters.get(source.source.platform)
        if adapter is None:
            self.repository.mark_source_failed(
                session_id,
                source.id,
                "unsupported_platform",
                "Unsupported playlist platform.",
            )
            return

        try:
            self.repository.mark_source_reading(
                source.id,
                effective_track_total(source.source.track_count, source.source.import_track_limit),
                source.read_count,
            )
            tracks = adapter.fetch_full_playlist(
                source.source,
                lambda read_count, total: self._record_progress(
                    source.id,
                    effective_read_count(read_count, source.source.import_track_limit),
                    effective_track_total(total, source.source.import_track_limit),
                ),
            )
            sampled_tracks = sample_source_tracks(
                tracks,
                source.source.import_track_limit,
                f"{session_id}:{source.id}",
            )
            self.repository.save_source_tracks(session_id, source, sampled_tracks)
        except Exception as error:
            logger.exception(
                "Failed to import source playlist",
                extra={
                    "platform": source.source.platform,
                    "playlist_id": source.source.source_playlist_id,
                    "owner_nickname": source.source.owner_nickname,
                },
            )
            self.repository.mark_source_failed(
                session_id,
                source.id,
                "playlist_full_import_failed",
                str(error) or "Failed to import playlist.",
            )

    def _record_progress(
        self, source_id: str, read_count: int, total: int | None
    ) -> None:
        self.repository.mark_source_reading(source_id, total, read_count)


def dedupe_sources(
    sources: list[ConfirmedSourcePlaylist],
) -> list[ConfirmedSourcePlaylist]:
    deduped: list[ConfirmedSourcePlaylist] = []
    seen: set[tuple[str, str]] = set()
    for source in sources:
        key = (source.platform, source.source_playlist_id)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(source)
    return deduped


def sample_source_tracks(
    tracks: list[SourceTrackItem],
    limit: int | None,
    seed: str,
) -> list[SourceTrackItem]:
    if limit is None or len(tracks) <= limit:
        return tracks
    keyed_tracks = [
        (
            sha256(track_sample_key(seed, index, track).encode()).hexdigest(),
            index,
            track,
        )
        for index, track in enumerate(tracks)
    ]
    return [track for _key, _index, track in sorted(keyed_tracks)[:limit]]


def track_sample_key(seed: str, index: int, track: SourceTrackItem) -> str:
    return f"{seed}:{index}:{track.platform}:{track.source_track_id}:{track.title}"


def effective_track_total(total: int | None, limit: int | None) -> int | None:
    if limit is None:
        return total
    if total is None:
        return limit
    return min(total, limit)


def effective_read_count(read_count: int, limit: int | None) -> int:
    if limit is None:
        return read_count
    return min(read_count, limit)
