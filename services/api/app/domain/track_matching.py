from dataclasses import dataclass

from app.domain.track_normalization import (
    normalize_artists,
    normalize_compact,
    version_signature,
)
from app.schemas.dedupe import UnifiedTrackItem
from app.schemas.matching import NeteaseTrackCandidate


@dataclass(frozen=True)
class MatchThresholds:
    auto_accept: float
    need_confirm: float


def score_candidate(
    track: UnifiedTrackItem, candidate: NeteaseTrackCandidate
) -> NeteaseTrackCandidate:
    title_score = 1.0 if track.normalized_title == normalize_compact(candidate.title) else 0.0
    artist_score = artist_overlap_score(track.normalized_artists, candidate.artists)
    duration_score = duration_similarity(track.duration_ms, candidate.duration_ms)
    album_score = album_similarity(track.normalized_album, candidate.album)
    version_score = version_similarity(track, candidate)
    score = round(
        title_score * 0.42
        + artist_score * 0.28
        + duration_score * 0.16
        + album_score * 0.06
        + version_score * 0.08,
        4,
    )
    return candidate.model_copy(
        update={
            "score": score,
            "reason": score_reason(
                title_score,
                artist_score,
                duration_score,
                album_score,
                version_score,
            ),
        }
    )


def classify_score(score: float, thresholds: MatchThresholds) -> str:
    if score >= thresholds.auto_accept:
        return "auto_accepted"
    if score >= thresholds.need_confirm:
        return "needs_confirm"
    return "no_match"


def artist_overlap_score(source_artists: list[str], candidate_artists: list[str]) -> float:
    source = {artist for artist in source_artists if artist}
    candidate = set(normalize_artists(candidate_artists))
    if not source or not candidate:
        return 0.0
    return len(source & candidate) / len(source | candidate)


def duration_similarity(left: int | None, right: int | None) -> float:
    if left is None or right is None:
        return 0.5
    diff = abs(left - right)
    if diff <= 3000:
        return 1.0
    if diff >= 30000:
        return 0.0
    return round(1 - (diff - 3000) / 27000, 4)


def album_similarity(source_album: str | None, candidate_album: str | None) -> float:
    if not source_album or not candidate_album:
        return 0.5
    return 1.0 if source_album == normalize_compact(candidate_album) else 0.0


def version_similarity(track: UnifiedTrackItem, candidate: NeteaseTrackCandidate) -> float:
    source_version = version_signature(track.display_title, track.album)
    candidate_version = version_signature(candidate.title, candidate.album)
    return 1.0 if source_version == candidate_version else 0.0


def score_reason(
    title_score: float,
    artist_score: float,
    duration_score: float,
    album_score: float,
    version_score: float,
) -> str:
    return (
        f"title={title_score:.2f};artists={artist_score:.2f};"
        f"duration={duration_score:.2f};album={album_score:.2f};"
        f"version={version_score:.2f}"
    )
