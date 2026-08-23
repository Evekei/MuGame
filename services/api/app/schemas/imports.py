from typing import Literal

from pydantic import BaseModel, Field


class ImportPreviewRequest(BaseModel):
    raw_share_texts: list[str] = Field(min_length=1, max_length=20)


class PlaylistPreviewError(BaseModel):
    code: str
    message: str


class PlaylistPreviewItem(BaseModel):
    platform: Literal["netease", "qq"] | None = None
    canonical_url: str | None = None
    source_playlist_id: str | None = None
    title: str | None = None
    owner_source_id: str | None = None
    owner_nickname: str | None = None
    owner_avatar_url: str | None = None
    cover_url: str | None = None
    track_count: int | None = None
    preview_status: Literal["ready", "failed"]
    error: PlaylistPreviewError | None = None


class ImportPreviewResponse(BaseModel):
    items: list[PlaylistPreviewItem]


class ConfirmedSourcePlaylist(BaseModel):
    platform: Literal["netease", "qq"]
    canonical_url: str
    source_playlist_id: str
    title: str
    owner_source_id: str
    owner_nickname: str
    owner_avatar_url: str | None = None
    cover_url: str | None = None
    track_count: int | None = None


class FullImportRequest(BaseModel):
    source_playlists: list[ConfirmedSourcePlaylist] = Field(min_length=1, max_length=20)


class SourceTrackItem(BaseModel):
    id: str
    platform: Literal["netease", "qq"]
    source_track_id: str
    title: str
    artists: list[str]
    album: str | None = None
    duration_ms: int | None = None
    cover_url: str | None = None
    source_playlist_id: str
    owner_source_id: str
    owner_nickname: str
    owner_avatar_url: str | None = None


class SourcePlaylistImportResult(ConfirmedSourcePlaylist):
    id: str
    status: Literal["pending", "reading", "ready", "failed"]
    read_count: int = 0
    error: PlaylistPreviewError | None = None


class ImportSessionResponse(BaseModel):
    id: str
    status: Literal["pending", "reading", "ready", "partial_failed", "failed"]
    raw_track_count: int
    source_playlists: list[SourcePlaylistImportResult]
    tracks: list[SourceTrackItem] = []
    created_at: str
    updated_at: str
