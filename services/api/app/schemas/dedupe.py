from pydantic import BaseModel


class Contributor(BaseModel):
    platform: str
    source_playlist_id: str
    owner_source_id: str
    owner_nickname: str
    owner_avatar_url: str | None = None


class UnifiedTrackItem(BaseModel):
    id: str
    normalized_title: str
    display_title: str
    artists: list[str]
    normalized_artists: list[str]
    album: str | None = None
    normalized_album: str | None = None
    duration_ms: int | None = None
    cover_url: str | None = None
    source_track_ids: list[str]
    contributors: list[Contributor]
    explain_dedup_reason: str


class DedupeTracksResponse(BaseModel):
    import_session_id: str
    raw_track_count: int
    unique_track_count: int
    tracks: list[UnifiedTrackItem]
