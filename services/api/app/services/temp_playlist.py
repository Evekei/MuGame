from collections.abc import Callable
from datetime import UTC, datetime
from hashlib import sha256

from app.core.errors import AppError
from app.integrations.netease.temp_playlist import (
    NeteaseAuthExpired,
    NeteasePlaylistSyncFailed,
)
from app.repositories.account_session_repository import AccountSessionRepository
from app.repositories.import_repository import ImportRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.dedupe import UnifiedTrackItem
from app.schemas.temp_playlist import (
    TempPlaylistBatchResult,
    TempPlaylistSyncResponse,
)
from app.services.temp_playlist_batches import add_target_tracks, run_batches
from app.services.track_dedupe import TrackDedupeService

NETEASE_TRACK_MANIPULATE_BATCH_LIMIT = 200


class TempPlaylistService:
    def __init__(
        self,
        import_repository: ImportRepository,
        mapping_repository: TrackMappingRepository,
        account_repository: AccountSessionRepository,
        adapter_factory: Callable,
        playlist_name: str,
        batch_size: int,
        retry_count: int,
    ):
        self.import_repository = import_repository
        self.mapping_repository = mapping_repository
        self.account_repository = account_repository
        self.adapter_factory = adapter_factory
        self.playlist_name = playlist_name
        self.batch_size = min(max(1, batch_size), NETEASE_TRACK_MANIPULATE_BATCH_LIMIT)
        self.retry_count = max(0, retry_count)
        self.dedupe_service = TrackDedupeService()

    def sync(self, import_session_id: str) -> TempPlaylistSyncResponse:
        record = self.account_repository.get_netease_session()
        if record is None:
            raise auth_expired_error()

        session = self.import_repository.get_session(import_session_id)
        deduped = self.dedupe_service.dedupe_session(session)
        target_ids, skipped_count = playable_netease_plan(
            deduped.tracks,
            self.mapping_repository,
        )
        target_ids = shuffled_playback_order(target_ids, import_session_id)
        adapter = self.adapter_factory(record)

        try:
            playlist_id = ensure_temp_playlist(adapter, self.playlist_name)
            return self._replace_playlist(
                import_session_id,
                adapter,
                playlist_id,
                target_ids,
                skipped_count,
            )
        except NeteaseAuthExpired as error:
            raise auth_expired_error() from error
        except NeteasePlaylistSyncFailed as error:
            raise sync_failed_error(str(error)) from error

    def _replace_playlist(
        self,
        import_session_id: str,
        adapter,
        playlist_id: str,
        target_ids: list[str],
        skipped_count: int,
    ) -> TempPlaylistSyncResponse:
        current_ids = adapter.get_playlist_track_ids(playlist_id)
        if current_ids == target_ids:
            return ready_response(import_session_id, playlist_id, target_ids, skipped_count, [])

        batches: list[TempPlaylistBatchResult] = []
        if current_ids and not run_batches(
            adapter.remove_tracks,
            playlist_id,
            current_ids,
            self.batch_size,
            self.retry_count,
            "remove",
            batches,
        ):
            return partial_response(import_session_id, playlist_id, 0, target_ids, skipped_count, batches)

        synced_count = add_target_tracks(
            adapter,
            playlist_id,
            target_ids,
            self.batch_size,
            self.retry_count,
            batches,
        )
        if synced_count != len(target_ids):
            return partial_response(
                import_session_id,
                playlist_id,
                synced_count,
                target_ids,
                skipped_count,
                batches,
            )

        return ready_response(import_session_id, playlist_id, target_ids, skipped_count, batches)


def playable_netease_plan(
    tracks: list[UnifiedTrackItem],
    mapping_repository: TrackMappingRepository,
) -> tuple[list[str], int]:
    ids: list[str] = []
    seen: set[str] = set()
    skipped_count = 0
    for track in tracks:
        song_id = playable_id_for_track(track, mapping_repository)
        if not song_id:
            skipped_count += 1
            continue
        if song_id not in seen:
            ids.append(song_id)
            seen.add(song_id)
    return ids, skipped_count


def shuffled_playback_order(track_ids: list[str], seed: str) -> list[str]:
    keyed_ids = sorted(
        enumerate(track_ids),
        key=lambda item: sha256(f"{seed}:{item[0]}:{item[1]}".encode()).hexdigest(),
    )
    shuffled = [track_id for _, track_id in keyed_ids]
    if len(shuffled) > 1 and shuffled == track_ids:
        offset = int(sha256(seed.encode()).hexdigest(), 16) % (len(shuffled) - 1) + 1
        return shuffled[offset:] + shuffled[:offset]
    return shuffled


def playable_id_for_track(
    track: UnifiedTrackItem, mapping_repository: TrackMappingRepository
) -> str | None:
    for source_key in track.source_track_ids:
        platform, _, source_track_id = source_key.partition(":")
        if platform == "netease" and source_track_id:
            return source_track_id
        if platform != "netease":
            cached = mapping_repository.get_mapping(platform, source_track_id)
            if cached:
                return cached.candidate.netease_song_id
    return None


def ensure_temp_playlist(adapter, playlist_name: str) -> str:
    playlist_id = adapter.find_playlist_by_name(playlist_name)
    if playlist_id:
        return playlist_id
    return adapter.create_playlist(playlist_name)


def ready_response(
    import_session_id: str,
    playlist_id: str,
    target_ids: list[str],
    skipped_count: int,
    batches: list[TempPlaylistBatchResult],
) -> TempPlaylistSyncResponse:
    return TempPlaylistSyncResponse(
        import_session_id=import_session_id,
        temp_playlist_id=playlist_id,
        status="ready",
        synced_count=len(target_ids),
        skipped_count=skipped_count,
        ready_at=datetime.now(UTC),
        batches=batches,
    )


def partial_response(
    import_session_id: str,
    playlist_id: str,
    synced_count: int,
    target_ids: list[str],
    skipped_count: int,
    batches: list[TempPlaylistBatchResult],
) -> TempPlaylistSyncResponse:
    return TempPlaylistSyncResponse(
        import_session_id=import_session_id,
        temp_playlist_id=playlist_id,
        status="partial_failed",
        synced_count=synced_count,
        skipped_count=skipped_count,
        failed_count=len(target_ids) - synced_count,
        batches=batches,
        error="NETEASE_SYNC_FAILED",
    )


def auth_expired_error() -> AppError:
    return AppError("AUTH_EXPIRED", "NetEase login expired. Please log in again.", 401)


def sync_failed_error(message: str) -> AppError:
    return AppError(
        "NETEASE_SYNC_FAILED",
        message or "Failed to sync NetEase temporary playlist.",
        502,
    )
