from collections import defaultdict
from itertools import combinations
from typing import Any

from app.schemas.dedupe import Contributor
from app.schemas.imports import ImportSessionResponse
from app.schemas.matching import MatchedTrackItem


def compute_analytics_v1(session: ImportSessionResponse) -> dict[str, dict[str, Any]]:
    """Compute Analytics V1 from playlist attribution, never playback history.

    Formulas:
    - overview.source_playlist_count = number of imported SourcePlaylist rows.
    - overview.participant_count = count of distinct owner_source_id values.
    - overview.raw_track_count = raw source track rows before dedupe.
    - overview.unique_track_count = count of unique UnifiedTrack/MatchedTrack rows.
    - overview.shared_track_count = unique tracks with >=2 distinct owner_source_id.
    - top_shared_tracks is sorted by contributor_count desc, then title/id asc.
    - pairwise_track_similarity compares owner track-id sets:
      intersection = |A tracks & B tracks|, union = |A tracks | B tracks|,
      jaccard = intersection / union, rounded to 6 decimals.
    - top_artists groups by trimmed case-insensitive artist text:
      unique_track_count = unique tracks containing artist,
      participant_count = distinct owners contributing those tracks.
    - pairwise_artist_similarity applies the same Jaccard formula to owner artist sets.
    - unique_taste_by_owner counts owner tracks/artists not owned by any other owner;
      ratio = exclusive_count / owner_total, rounded to 6 decimals.
    - most_similar_pair and most_distinct_pair rank owner pairs by the mean of
      track_jaccard and artist_jaccard and include both component scores.
    """
    context = build_context(session)
    pairwise_tracks = pairwise_track_similarity(context)
    pairwise_artists = pairwise_artist_similarity(context)
    pair_extremes = pair_extreme_payloads(pairwise_tracks, pairwise_artists)

    return {
        "overview": overview_payload(session, context),
        "top_shared_tracks": {
            "tracks": top_shared_tracks(session.matched_tracks, context.owner_lookup)
        },
        "pairwise_track_similarity": {"pairs": pairwise_tracks},
        "top_artists": {"artists": top_artists_payload(context)},
        "pairwise_artist_similarity": {"pairs": pairwise_artists},
        "unique_taste_by_owner": {"owners": unique_taste_payload(context)},
        "most_similar_pair": {"pair": pair_extremes["most_similar_pair"]},
        "most_distinct_pair": {"pair": pair_extremes["most_distinct_pair"]},
    }


class AnalyticsContext:
    def __init__(self) -> None:
        self.owners: dict[str, dict[str, Any]] = {}
        self.owner_lookup: dict[str, dict[str, Any]] = {}
        self.owner_tracks: dict[str, set[str]] = defaultdict(set)
        self.owner_artists: dict[str, set[str]] = defaultdict(set)
        self.track_owners: dict[str, set[str]] = defaultdict(set)
        self.artist_owners: dict[str, set[str]] = defaultdict(set)
        self.artist_tracks: dict[str, set[str]] = defaultdict(set)
        self.artist_display: dict[str, str] = {}
        self.tracks: dict[str, MatchedTrackItem] = {}


def build_context(session: ImportSessionResponse) -> AnalyticsContext:
    context = AnalyticsContext()
    for source in session.source_playlists:
        owner_id = source.owner_source_id
        owner = ensure_owner(context, owner_id, source.owner_nickname)
        owner["source_playlist_ids"].add(source.source_playlist_id)

    for track in session.matched_tracks:
        context.tracks[track.id] = track
        owners = unique_track_owners(track.contributors)
        for owner_id, contributor in owners.items():
            ensure_owner(context, owner_id, contributor.owner_nickname)
            context.owner_tracks[owner_id].add(track.id)
            context.track_owners[track.id].add(owner_id)
            for artist in track.artists:
                artist_key = normalize_artist(artist)
                if not artist_key:
                    continue
                context.artist_display.setdefault(artist_key, artist.strip())
                context.owner_artists[owner_id].add(artist_key)
                context.artist_owners[artist_key].add(owner_id)
                context.artist_tracks[artist_key].add(track.id)
    return context


def ensure_owner(context: AnalyticsContext, owner_id: str, nickname: str) -> dict[str, Any]:
    if owner_id not in context.owners:
        context.owners[owner_id] = {
            "owner_source_id": owner_id,
            "owner_nickname": nickname,
            "source_playlist_ids": set(),
        }
        context.owner_lookup[owner_id] = {
            "owner_source_id": owner_id,
            "owner_nickname": nickname,
        }
    return context.owners[owner_id]


def unique_track_owners(contributors: list[Contributor]) -> dict[str, Contributor]:
    owners: dict[str, Contributor] = {}
    for contributor in contributors:
        owners.setdefault(contributor.owner_source_id, contributor)
    return owners


def overview_payload(
    session: ImportSessionResponse,
    context: AnalyticsContext,
) -> dict[str, Any]:
    return {
        "source_playlist_count": len(session.source_playlists),
        "participant_count": len(context.owners),
        "raw_track_count": session.raw_track_count,
        "unique_track_count": len(session.matched_tracks),
        "shared_track_count": sum(
            1 for owners in context.track_owners.values() if len(owners) >= 2
        ),
        "participants": [
            {
                **owner_identity(context, owner_id),
                "source_playlist_count": len(context.owners[owner_id]["source_playlist_ids"]),
            }
            for owner_id in sorted(context.owners)
        ],
    }


def top_shared_tracks(
    tracks: list[MatchedTrackItem],
    owner_lookup: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    shared = []
    for track in tracks:
        owner_ids = sorted(unique_track_owners(track.contributors))
        if len(owner_ids) < 2:
            continue
        shared.append(
            {
                "track_id": track.id,
                "display_title": track.display_title,
                "artists": track.artists,
                "contributor_count": len(owner_ids),
                "contributors": [owner_lookup[owner_id] for owner_id in owner_ids],
            }
        )
    return sorted(
        shared,
        key=lambda item: (-item["contributor_count"], item["display_title"], item["track_id"]),
    )


def pairwise_track_similarity(context: AnalyticsContext) -> list[dict[str, Any]]:
    pairs = []
    for owner_a, owner_b in combinations(sorted(context.owners), 2):
        values_a = context.owner_tracks.get(owner_a, set())
        values_b = context.owner_tracks.get(owner_b, set())
        shared_ids = values_a & values_b
        union = len(values_a | values_b)
        pairs.append(
            {
                "owner_a": owner_identity_for_pair(context.owners, owner_a),
                "owner_b": owner_identity_for_pair(context.owners, owner_b),
                "intersection": len(shared_ids),
                "union": union,
                "jaccard": ratio(len(shared_ids), union),
                "shared_tracks": tracks_payload(shared_ids, context),
            }
        )
    return pairs


def pairwise_artist_similarity(context: AnalyticsContext) -> list[dict[str, Any]]:
    pairs = []
    for owner_a, owner_b in combinations(sorted(context.owners), 2):
        values_a = context.owner_artists.get(owner_a, set())
        values_b = context.owner_artists.get(owner_b, set())
        shared_artists = values_a & values_b
        union = len(values_a | values_b)
        pairs.append(
            {
                "owner_a": owner_identity_for_pair(context.owners, owner_a),
                "owner_b": owner_identity_for_pair(context.owners, owner_b),
                "intersection": len(shared_artists),
                "union": union,
                "jaccard": ratio(len(shared_artists), union),
                "shared_artists": artist_names(shared_artists, context),
            }
        )
    return pairs


def top_artists_payload(context: AnalyticsContext) -> list[dict[str, Any]]:
    artists = [
        {
            "artist": context.artist_display[artist_key],
            "artist_key": artist_key,
            "unique_track_count": len(context.artist_tracks[artist_key]),
            "participant_count": len(context.artist_owners[artist_key]),
            "tracks": tracks_payload(context.artist_tracks[artist_key], context),
        }
        for artist_key in context.artist_tracks
    ]
    return sorted(
        artists,
        key=lambda item: (-item["unique_track_count"], -item["participant_count"], item["artist"]),
    )


def unique_taste_payload(context: AnalyticsContext) -> list[dict[str, Any]]:
    rows = []
    for owner_id in sorted(context.owners):
        tracks = context.owner_tracks.get(owner_id, set())
        artists = context.owner_artists.get(owner_id, set())
        exclusive_tracks = {
            track_id for track_id in tracks if context.track_owners[track_id] == {owner_id}
        }
        exclusive_artists = {
            artist for artist in artists if context.artist_owners[artist] == {owner_id}
        }
        rows.append(
            {
                "owner": owner_identity_for_pair(context.owners, owner_id),
                "total_track_count": len(tracks),
                "exclusive_track_count": len(exclusive_tracks),
                "exclusive_track_ratio": ratio(len(exclusive_tracks), len(tracks)),
                "exclusive_tracks": tracks_payload(exclusive_tracks, context),
                "total_artist_count": len(artists),
                "exclusive_artist_count": len(exclusive_artists),
                "exclusive_artist_ratio": ratio(len(exclusive_artists), len(artists)),
                "exclusive_artists": artist_names(exclusive_artists, context),
            }
        )
    return rows


def tracks_payload(track_ids: set[str], context: AnalyticsContext) -> list[dict[str, Any]]:
    return [
        track_payload(context.tracks[track_id], context.owner_lookup)
        for track_id in sorted(
            track_ids,
            key=lambda track_id: (
                context.tracks[track_id].display_title,
                track_id,
            ),
        )
        if track_id in context.tracks
    ]


def track_payload(
    track: MatchedTrackItem,
    owner_lookup: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    owner_ids = sorted(unique_track_owners(track.contributors))
    return {
        "track_id": track.id,
        "display_title": track.display_title,
        "artists": track.artists,
        "contributor_count": len(owner_ids),
        "contributors": [owner_lookup[owner_id] for owner_id in owner_ids],
    }


def artist_names(artist_keys: set[str], context: AnalyticsContext) -> list[str]:
    return [context.artist_display[key] for key in sorted(artist_keys)]


def pair_extreme_payloads(
    track_pairs: list[dict[str, Any]],
    artist_pairs: list[dict[str, Any]],
) -> dict[str, dict[str, Any] | None]:
    ranked = [
        pair_extreme_payload(track_pair, artist_pair)
        for track_pair, artist_pair in zip(track_pairs, artist_pairs, strict=True)
    ]
    if not ranked:
        return {"most_similar_pair": None, "most_distinct_pair": None}
    return {
        "most_similar_pair": max(ranked, key=lambda item: item["score"]),
        "most_distinct_pair": min(ranked, key=lambda item: item["score"]),
    }


def pair_extreme_payload(track_pair: dict[str, Any], artist_pair: dict[str, Any]) -> dict[str, Any]:
    return {
        "owner_a": track_pair["owner_a"],
        "owner_b": track_pair["owner_b"],
        "score": ratio(track_pair["jaccard"] + artist_pair["jaccard"], 2),
        "track_intersection": track_pair["intersection"],
        "track_union": track_pair["union"],
        "track_jaccard": track_pair["jaccard"],
        "artist_intersection": artist_pair["intersection"],
        "artist_union": artist_pair["union"],
        "artist_jaccard": artist_pair["jaccard"],
    }


def owner_identity(context: AnalyticsContext, owner_id: str) -> dict[str, str]:
    return context.owner_lookup[owner_id]


def owner_identity_for_pair(owners: dict[str, dict[str, Any]], owner_id: str) -> dict[str, str]:
    owner = owners[owner_id]
    return {
        "owner_source_id": owner["owner_source_id"],
        "owner_nickname": owner["owner_nickname"],
    }


def normalize_artist(artist: str) -> str:
    return " ".join(artist.strip().lower().split())


def ratio(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 6)
