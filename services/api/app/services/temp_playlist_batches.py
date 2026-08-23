from app.integrations.netease.temp_playlist import NeteasePlaylistSyncFailed
from app.schemas.temp_playlist import TempPlaylistBatchResult


def add_target_tracks(
    adapter,
    playlist_id: str,
    target_ids: list[str],
    batch_size: int,
    retry_count: int,
    batches: list[TempPlaylistBatchResult],
) -> int:
    synced_count = 0
    for chunk_start in range(0, len(target_ids), batch_size):
        chunk = target_ids[chunk_start : chunk_start + batch_size]
        if not run_batch(
            adapter.add_tracks,
            playlist_id,
            chunk,
            retry_count,
            "add",
            chunk_start,
            batches,
        ):
            return synced_count
        synced_count += len(chunk)
    return synced_count


def run_batches(
    operation,
    playlist_id: str,
    track_ids: list[str],
    batch_size: int,
    retry_count: int,
    operation_name: str,
    batches: list[TempPlaylistBatchResult],
) -> bool:
    for chunk_start in range(0, len(track_ids), batch_size):
        chunk = track_ids[chunk_start : chunk_start + batch_size]
        if not run_batch(
            operation,
            playlist_id,
            chunk,
            retry_count,
            operation_name,
            chunk_start,
            batches,
        ):
            return False
    return True


def run_batch(
    operation,
    playlist_id: str,
    track_ids: list[str],
    retry_count: int,
    operation_name: str,
    start_index: int,
    batches: list[TempPlaylistBatchResult],
) -> bool:
    for attempt in range(1, retry_count + 2):
        try:
            operation(playlist_id, track_ids)
        except NeteasePlaylistSyncFailed as error:
            batches.append(batch_result(operation_name, start_index, track_ids, attempt, str(error)))
            continue
        batches.append(batch_result(operation_name, start_index, track_ids, attempt))
        return True
    return False


def batch_result(
    operation_name: str,
    start_index: int,
    track_ids: list[str],
    attempt: int,
    error: str | None = None,
) -> TempPlaylistBatchResult:
    return TempPlaylistBatchResult(
        operation=operation_name,
        start_index=start_index,
        track_count=len(track_ids),
        attempt=attempt,
        status="failed" if error else "ok",
        error=error,
    )
