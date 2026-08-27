from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.matching import MatchedTrackItem


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
    source_tags: list[str] = Field(default_factory=list)
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
    source_tags: list[str] = Field(default_factory=list)
    track_count: int | None = None
    import_track_limit: int | None = Field(
        default=None,
        ge=1,
        description=(
            "Optional per-source playlist import cap. When set, the backend "
            "keeps a deterministic random sample of at most this many tracks "
            "from this source playlist; when omitted, all fetched tracks are imported."
        ),
    )


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


class ImportStageProgress(BaseModel):
    current: int = 0
    total: int = 0


class ImportProgress(BaseModel):
    read: ImportStageProgress = Field(default_factory=ImportStageProgress)
    match: ImportStageProgress = Field(default_factory=ImportStageProgress)
    sync: ImportStageProgress = Field(default_factory=ImportStageProgress)


class AnalyticsMetric(BaseModel):
    """Persisted Analytics V1/V2 metric.

    Formulas use SourcePlaylist owner_source_id, track contributors, and
    unique UnifiedTrack/MatchedTrack rows. Playback history is never used.
    Jaccard metrics use intersection / union and are rounded to 6 decimals.
    Exclusive ratios use exclusive_count / owner_total and are rounded to
    6 decimals. The owner pair score is the mean of track_jaccard and
    artist_jaccard, with component numbers included in the payload.

    Analytics V2 genre formulas never infer style with an LLM. GenreResolver
    uses explicit song/album/artist tags first, SourcePlaylist tags as weaker
    evidence second, and UNKNOWN otherwise. Every genre assignment records
    source and confidence. Pairwise genre similarity normalizes each owner's
    confidence-weighted genre counts into a distribution, then uses weighted
    Jaccard = sum(min(p_i, q_i)) / sum(max(p_i, q_i)).
    """

    metric_key: str = Field(
        description=(
            "Analytics V1 metric key: overview, top_shared_tracks, "
            "pairwise_track_similarity, top_artists, pairwise_artist_similarity, "
            "unique_taste_by_owner, most_similar_pair, most_distinct_pair, "
            "genre_assignments, top_genres, shared_genres, "
            "pairwise_genre_similarity, top_albums, shared_albums, "
            "artist_diversity, or genre_diversity."
        )
    )
    payload: dict[str, Any] = Field(
        description=(
            "Metric payload computed from SourcePlaylist, Contributor, and "
            "UnifiedTrack/MatchedTrack attribution. Overview counts source "
            "playlists, distinct owner_source_id participants, raw tracks, "
            "unique tracks, and tracks with >=2 contributors. Pairwise metrics "
            "use Jaccard = intersection / union. Unique taste ratios use "
            "exclusive_count / owner_total. Pair extremes rank by the mean of "
            "track_jaccard and artist_jaccard and include both components. "
            "V2 payloads include data_coverage and confidence where data may "
            "be incomplete, especially genre metrics. top_genres sums "
            "owner-track confidence weights; pairwise_genre_similarity uses "
            "weighted Jaccard over normalized owner genre distributions; "
            "artist_diversity reports unique_artists, top_artist_share, and "
            "Shannon entropy."
        )
    )
    status: str
    computed_at: str


class ImportPlaybackPayload(BaseModel):
    temp_playlist_id: str
    tracks: list[MatchedTrackItem]


class ImportHistorySourceSummary(BaseModel):
    platform: Literal["netease", "qq"]
    source_playlist_id: str
    title: str
    owner_nickname: str
    import_track_limit: int | None = None
    read_count: int = 0


class ImportHistoryItem(BaseModel):
    session_id: str
    ready_to_play_at: str
    temp_playlist_id: str
    playable_track_count: int
    source_playlists: list[ImportHistorySourceSummary]
    owner_nicknames: list[str]
    created_at: str
    updated_at: str


class ImportSessionDeleteResponse(BaseModel):
    session_id: str
    deleted: bool


class ImportSessionResponse(BaseModel):
    id: str
    status: Literal[
        "pending",
        "reading",
        "ready",
        "partial_failed",
        "failed",
        "previewed",
        "importing",
        "normalizing",
        "matching",
        "syncing_temp",
        "ready_to_play",
    ]
    raw_track_count: int
    source_playlists: list[SourcePlaylistImportResult]
    tracks: list[SourceTrackItem] = []
    created_at: str
    updated_at: str
    failed_stage: Literal[
        "importing",
        "normalizing",
        "matching",
        "syncing_temp",
    ] | None = None
    error: PlaylistPreviewError | None = None
    progress: ImportProgress | None = None
    temp_playlist_id: str | None = None
    ready_to_play_at: str | None = None
    analytics_job_id: str | None = None
    analytics_status: Literal[
        "pending",
        "running",
        "partial",
        "completed",
        "failed",
    ] | None = None
    analytics_results: list[AnalyticsMetric] = []
    matched_tracks: list[MatchedTrackItem] = []
    playback: ImportPlaybackPayload | None = None
