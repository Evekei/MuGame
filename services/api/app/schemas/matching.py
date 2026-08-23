from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.dedupe import Contributor


class NeteaseTrackCandidate(BaseModel):
    netease_song_id: str
    title: str
    artists: list[str]
    album: str | None = None
    duration_ms: int | None = None
    score: float = 0
    reason: str = ""


class MatchedTrackItem(BaseModel):
    id: str
    display_title: str
    artists: list[str]
    album: str | None = None
    duration_ms: int | None = None
    source_track_ids: list[str]
    contributors: list[Contributor]
    match_status: Literal[
        "auto_accepted",
        "needs_confirm",
        "no_match",
        "manual_confirmed",
    ]
    netease_song_id: str | None = None
    match_confidence: float = 0
    match_reason: str
    candidates: list[NeteaseTrackCandidate] = Field(default_factory=list)


class MatchTracksResponse(BaseModel):
    import_session_id: str
    total_track_count: int
    auto_matched_count: int
    needs_confirm_count: int
    no_match_count: int
    tracks: list[MatchedTrackItem]


class MatchJobResponse(BaseModel):
    id: str
    import_session_id: str
    status: Literal["pending", "running", "ready", "failed", "rate_limited"]
    processed_track_count: int
    total_track_count: int
    auto_matched_count: int = 0
    needs_confirm_count: int = 0
    no_match_count: int = 0
    current_title: str | None = None
    error: str | None = None
    result: MatchTracksResponse | None = None


class ManualMatchConfirmRequest(BaseModel):
    source_track_ids: list[str] = Field(min_length=1)
    netease_song_id: str
    title: str
    artists: list[str]
    album: str | None = None
    duration_ms: int | None = None
