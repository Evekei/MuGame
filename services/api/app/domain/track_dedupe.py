from dataclasses import dataclass
from uuid import NAMESPACE_URL, uuid5

from app.domain.track_normalization import (
    normalize_artists,
    normalize_compact,
    primary_artist_key,
    version_signature,
)
from app.schemas.dedupe import Contributor, UnifiedTrackItem
from app.schemas.imports import SourceTrackItem

DURATION_TOLERANCE_MS = 5000


@dataclass
class DedupeBucket:
    track: UnifiedTrackItem
    base_key: tuple[str, str, str]


def dedupe_source_tracks(source_tracks: list[SourceTrackItem]) -> list[UnifiedTrackItem]:
    buckets: list[DedupeBucket] = []
    stable_index: dict[str, DedupeBucket] = {}

    for source_track in source_tracks:
        bucket = find_bucket(source_track, buckets, stable_index)
        if bucket is None:
            bucket = create_bucket(source_track)
            buckets.append(bucket)
        else:
            merge_source_track(bucket.track, source_track)
        stable_index[stable_track_key(source_track)] = bucket

    return [bucket.track for bucket in buckets]


def find_bucket(
    source_track: SourceTrackItem,
    buckets: list[DedupeBucket],
    stable_index: dict[str, DedupeBucket],
) -> DedupeBucket | None:
    stable_key = stable_track_key(source_track)
    if stable_key in stable_index:
        return stable_index[stable_key]

    base_key = candidate_base_key(source_track)
    for bucket in buckets:
        if bucket.base_key != base_key:
            continue
        if durations_match(bucket.track.duration_ms, source_track.duration_ms):
            return bucket
    return None


def create_bucket(source_track: SourceTrackItem) -> DedupeBucket:
    normalized_title = normalize_compact(source_track.title)
    normalized_artists = normalize_artists(source_track.artists)
    normalized_album = normalize_compact(source_track.album)
    unified = UnifiedTrackItem(
        id=stable_unified_id(source_track),
        normalized_title=normalized_title,
        display_title=source_track.title,
        artists=source_track.artists,
        normalized_artists=normalized_artists,
        album=source_track.album,
        normalized_album=normalized_album or None,
        duration_ms=source_track.duration_ms,
        cover_url=source_track.cover_url,
        source_track_ids=[stable_track_key(source_track)],
        contributors=[contributor_from_source(source_track)],
        explain_dedup_reason="unique_first_occurrence",
    )
    return DedupeBucket(track=unified, base_key=candidate_base_key(source_track))


def merge_source_track(unified: UnifiedTrackItem, source_track: SourceTrackItem) -> None:
    track_key = stable_track_key(source_track)
    is_stable_merge = track_key in unified.source_track_ids
    if not is_stable_merge:
        unified.source_track_ids.append(track_key)

    contributor = contributor_from_source(source_track)
    if contributor_key(contributor) not in {
        contributor_key(item) for item in unified.contributors
    }:
        unified.contributors.append(contributor)

    unified.explain_dedup_reason = explain_merge(unified, source_track, is_stable_merge)


def candidate_base_key(source_track: SourceTrackItem) -> tuple[str, str, str]:
    return (
        normalize_compact(source_track.title),
        primary_artist_key(source_track.artists),
        version_signature(source_track.title, source_track.album),
    )


def stable_track_key(source_track: SourceTrackItem) -> str:
    return f"{source_track.platform}:{source_track.source_track_id}"


def stable_unified_id(source_track: SourceTrackItem) -> str:
    return str(uuid5(NAMESPACE_URL, stable_track_key(source_track)))


def durations_match(left: int | None, right: int | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return abs(left - right) <= DURATION_TOLERANCE_MS


def contributor_from_source(source_track: SourceTrackItem) -> Contributor:
    return Contributor(
        platform=source_track.platform,
        source_playlist_id=source_track.source_playlist_id,
        owner_source_id=source_track.owner_source_id,
        owner_nickname=source_track.owner_nickname,
        owner_avatar_url=source_track.owner_avatar_url,
    )


def contributor_key(contributor: Contributor) -> tuple[str, str, str]:
    return (
        contributor.platform,
        contributor.source_playlist_id,
        contributor.owner_source_id,
    )


def explain_merge(
    unified: UnifiedTrackItem, source_track: SourceTrackItem, is_stable_merge: bool
) -> str:
    if is_stable_merge:
        return f"merged_by_platform_track_id:{stable_track_key(source_track)}"
    delta = duration_delta(unified.duration_ms, source_track.duration_ms)
    return (
        "merged_by_normalized_title_primary_artist_duration:"
        f"title={unified.normalized_title};"
        f"primary_artist={primary_artist_key(source_track.artists)};"
        f"duration_delta_ms={delta};"
        f"version={version_signature(source_track.title, source_track.album)}"
    )


def duration_delta(left: int | None, right: int | None) -> str:
    if left is None or right is None:
        return "unknown"
    return str(abs(left - right))
