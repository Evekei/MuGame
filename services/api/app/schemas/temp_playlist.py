from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class KnownTempPlaylistSyncRequest(BaseModel):
    import_session_id: str
    netease_song_ids: list[str]


class TempPlaylistBatchResult(BaseModel):
    operation: Literal["add", "remove"]
    start_index: int
    track_count: int
    attempt: int
    status: Literal["ok", "failed"]
    error: str | None = None


class TempPlaylistSyncResponse(BaseModel):
    import_session_id: str
    temp_playlist_id: str
    status: Literal["ready", "partial_failed"]
    synced_count: int
    skipped_count: int
    failed_count: int = 0
    ready_at: datetime | None = None
    batches: list[TempPlaylistBatchResult]
    error: str | None = None
