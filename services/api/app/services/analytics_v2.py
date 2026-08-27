from collections import defaultdict
from itertools import combinations
from typing import Any

from app.schemas.imports import ImportSessionResponse
from app.schemas.matching import GenreAssignment, MatchedTrackItem
from app.services.analytics_coverage import (
    album_coverage,
    artist_coverage,
    normalize_album,
)
from app.services.analytics_math import (
    diversity_from_counts,
    normalize_distribution,
    ratio,
    weighted_jaccard,
)
from app.services.analytics_v1 import build_context, normalize_artist


SOURCE_PLAYLIST_TAG_CONFIDENCE = 0.45
GENRE_DIVERSITY_MIN_COVERAGE = 0.6


def compute_analytics_v2(
    session: ImportSessionResponse,
    include_lyric_keywords: bool = False,
) -> dict[str, dict[str, Any]]:
    """Compute Analytics V2 with traceable genre evidence only.

    GenreResolver priority:
    1. explicit track.genre_assignments from source platform/NetEase
       song, album, or artist tags;
    2. SourcePlaylist.source_tags as weaker evidence with confidence 0.45;
    3. UNKNOWN with confidence 0 when no reliable tag exists.

    Every assignment records genre, source, and confidence. Genre metrics expose
    data_coverage = tracks_with_known_genre / unique_track_count and confidence
    = average known assignment confidence. Pairwise genre similarity builds a
    confidence-weighted genre vector per owner, normalizes it to a distribution,
    then uses weighted Jaccard: sum(min(p_i, q_i)) / sum(max(p_i, q_i)).
    top_genres overall sums owner-track genre weights, so a shared track
    contributes to each owner's distribution; shared_genres counts unique
    tracks and distinct owners per genre. top_albums and shared_albums use
    unique track counts and distinct owner counts, skipping missing albums.
    Artist diversity uses unique artists, top_artist_share =
    max(unique_track_count_by_artist) / sum(unique_track_count_by_artist), and
    Shannon entropy = -sum(p_i * log2(p_i)).
    """
    resolver = GenreResolver(session)
    assignments = [resolver.resolve(track) for track in session.matched_tracks]
    context = V2Context(session, assignments)
    genre_pairs = pairwise_genre_similarity(context)

    metrics = {
        "genre_assignments": {
            "data_coverage": context.genre_coverage,
            "confidence": context.genre_confidence,
            "tracks": [assignment.payload for assignment in assignments],
        },
        "top_genres": top_genres_payload(context),
        "shared_genres": {"genres": shared_genres_payload(context)},
        "pairwise_genre_similarity": {"pairs": genre_pairs},
        "top_albums": top_albums_payload(context),
        "shared_albums": shared_albums_payload(context),
        "artist_diversity": artist_diversity_payload(context),
        "genre_diversity": genre_diversity_payload(context),
    }
    if include_lyric_keywords:
        metrics["lyric_keywords"] = {
            "status": "pending_slow_task",
            "data_coverage": {"known_track_count": 0, "total_track_count": 0, "ratio": 0.0},
        }
    return metrics


class GenreResolver:
    def __init__(self, session: ImportSessionResponse) -> None:
        self.playlist_tags = {
            source.source_playlist_id: source.source_tags
            for source in session.source_playlists
        }

    def resolve(self, track: MatchedTrackItem) -> "ResolvedGenreAssignment":
        explicit = [
            normalized_assignment(assignment)
            for assignment in track.genre_assignments
            if normalize_genre(assignment.genre)
        ]
        if explicit:
            return ResolvedGenreAssignment(track, explicit)

        weak_assignments = []
        seen = set()
        for contributor in track.contributors:
            for tag in self.playlist_tags.get(contributor.source_playlist_id, []):
                genre = normalize_genre(tag)
                if not genre or genre in seen:
                    continue
                seen.add(genre)
                weak_assignments.append(
                    GenreAssignment(
                        genre=genre,
                        source=f"source_playlist_tag:{contributor.source_playlist_id}",
                        confidence=SOURCE_PLAYLIST_TAG_CONFIDENCE,
                    )
                )
        if weak_assignments:
            return ResolvedGenreAssignment(track, weak_assignments)

        return ResolvedGenreAssignment(
            track,
            [GenreAssignment(genre="UNKNOWN", source="unknown", confidence=0)],
        )


class ResolvedGenreAssignment:
    def __init__(
        self,
        track: MatchedTrackItem,
        assignments: list[GenreAssignment],
    ) -> None:
        self.track = track
        self.assignments = assignments

    @property
    def known_assignments(self) -> list[GenreAssignment]:
        return [
            assignment
            for assignment in self.assignments
            if assignment.genre != "UNKNOWN" and assignment.confidence > 0
        ]

    @property
    def payload(self) -> dict[str, Any]:
        return {
            "track_id": self.track.id,
            "display_title": self.track.display_title,
            "assignments": [
                assignment.model_dump(mode="json")
                for assignment in self.assignments
            ],
        }


class V2Context:
    def __init__(
        self,
        session: ImportSessionResponse,
        assignments: list[ResolvedGenreAssignment],
    ) -> None:
        self.session = session
        self.assignments = assignments
        self.v1_context = build_context(session)
        self.owner_genre_weights: dict[str, dict[str, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        self.genre_tracks: dict[str, set[str]] = defaultdict(set)
        self.genre_owners: dict[str, set[str]] = defaultdict(set)
        self.album_tracks: dict[str, set[str]] = defaultdict(set)
        self.album_owners: dict[str, set[str]] = defaultdict(set)
        self.album_display: dict[str, str] = {}
        self.known_assignment_confidences: list[float] = []
        self._index()

    @property
    def genre_coverage(self) -> dict[str, Any]:
        total = len(self.session.matched_tracks)
        known = sum(1 for item in self.assignments if item.known_assignments)
        return {
            "known_track_count": known,
            "total_track_count": total,
            "ratio": ratio(known, total),
        }

    @property
    def genre_confidence(self) -> dict[str, Any]:
        values = self.known_assignment_confidences
        return {
            "average": ratio(sum(values), len(values)),
            "assignment_count": len(values),
        }

    def _index(self) -> None:
        for resolved in self.assignments:
            owner_ids = sorted({item.owner_source_id for item in resolved.track.contributors})
            for assignment in resolved.known_assignments:
                self.genre_tracks[assignment.genre].add(resolved.track.id)
                self.known_assignment_confidences.append(assignment.confidence)
                for owner_id in owner_ids:
                    self.owner_genre_weights[owner_id][assignment.genre] += assignment.confidence
                    self.genre_owners[assignment.genre].add(owner_id)
            self._index_album(resolved.track, owner_ids)

    def _index_album(self, track: MatchedTrackItem, owner_ids: list[str]) -> None:
        album = normalize_album(track.album)
        if not album:
            return
        self.album_display.setdefault(album, track.album.strip())
        self.album_tracks[album].add(track.id)
        for owner_id in owner_ids:
            self.album_owners[album].add(owner_id)

    def owner_genre_weights_merged(self) -> dict[str, float]:
        merged: dict[str, float] = defaultdict(float)
        for weights in self.owner_genre_weights.values():
            for genre, weight in weights.items():
                merged[genre] += weight
        return merged


def top_genres_payload(context: V2Context) -> dict[str, Any]:
    by_owner = {}
    for owner_id in sorted(context.v1_context.owners):
        by_owner[owner_id] = genre_rows(context.owner_genre_weights.get(owner_id, {}))
    return {
        "data_coverage": context.genre_coverage,
        "confidence": context.genre_confidence,
        "overall": genre_rows(
            {
                genre: sum(weights.get(genre, 0) for weights in context.owner_genre_weights.values())
                for genre in context.genre_tracks
            }
        ),
        "by_owner": by_owner,
    }


def genre_rows(weights: dict[str, float]) -> list[dict[str, Any]]:
    total = sum(weights.values())
    rows = [
        {
            "genre": genre,
            "weighted_count": round(weight, 6),
            "share": ratio(weight, total),
        }
        for genre, weight in weights.items()
        if weight > 0
    ]
    return sorted(rows, key=lambda item: (-item["weighted_count"], item["genre"]))


def shared_genres_payload(context: V2Context) -> list[dict[str, Any]]:
    rows = [
        {
            "genre": genre,
            "participant_count": len(owners),
            "unique_track_count": len(context.genre_tracks[genre]),
        }
        for genre, owners in context.genre_owners.items()
        if len(owners) >= 2
    ]
    return sorted(rows, key=lambda item: (-item["participant_count"], item["genre"]))


def pairwise_genre_similarity(context: V2Context) -> list[dict[str, Any]]:
    pairs = []
    owners = context.v1_context.owners
    distributions = {
        owner_id: normalize_distribution(context.owner_genre_weights.get(owner_id, {}))
        for owner_id in owners
    }
    for owner_a, owner_b in combinations(sorted(owners), 2):
        pairs.append(
            {
                "owner_a": owner_identity(owners, owner_a),
                "owner_b": owner_identity(owners, owner_b),
                "algorithm": "weighted_jaccard_normalized_distribution",
                "jaccard": weighted_jaccard(distributions[owner_a], distributions[owner_b]),
                "owner_a_distribution": distributions[owner_a],
                "owner_b_distribution": distributions[owner_b],
                "data_coverage": context.genre_coverage,
            }
        )
    return pairs


def top_albums_payload(context: V2Context) -> dict[str, Any]:
    rows = [
        album_row(context, album)
        for album in context.album_tracks
    ]
    return {
        "data_coverage": album_coverage(context.session.matched_tracks),
        "albums": sorted(
            rows,
            key=lambda item: (-item["unique_track_count"], -item["participant_count"], item["album"]),
        ),
    }


def shared_albums_payload(context: V2Context) -> dict[str, Any]:
    return {
        "data_coverage": album_coverage(context.session.matched_tracks),
        "albums": [
            row
            for row in top_albums_payload(context)["albums"]
            if row["participant_count"] >= 2
        ],
    }


def album_row(context: V2Context, album: str) -> dict[str, Any]:
    return {
        "album": context.album_display[album],
        "album_key": album,
        "unique_track_count": len(context.album_tracks[album]),
        "participant_count": len(context.album_owners[album]),
    }


def artist_diversity_payload(context: V2Context) -> dict[str, Any]:
    overall_counts = artist_track_counts(context.session.matched_tracks)
    by_owner = {}
    for owner_id in sorted(context.v1_context.owners):
        by_owner[owner_id] = artist_diversity_from_counts(
            owner_artist_counts(context.session.matched_tracks, owner_id)
        )
    return {
        "data_coverage": artist_coverage(context.session.matched_tracks),
        "overall": artist_diversity_from_counts(overall_counts),
        "by_owner": by_owner,
    }


def genre_diversity_payload(context: V2Context) -> dict[str, Any]:
    coverage = context.genre_coverage
    available = coverage["ratio"] >= GENRE_DIVERSITY_MIN_COVERAGE
    overall = genre_diversity_from_counts(context.owner_genre_weights_merged())
    by_owner = {
        owner_id: genre_diversity_from_counts(context.owner_genre_weights.get(owner_id, {}))
        for owner_id in sorted(context.v1_context.owners)
    }
    return {
        "available": available,
        "reason": None if available else "genre_data_coverage_too_low",
        "data_coverage": coverage,
        "confidence": context.genre_confidence,
        "overall": overall if available else None,
        "by_owner": by_owner if available else {},
    }


def artist_diversity_from_counts(counts: dict[str, float]) -> dict[str, Any]:
    base = diversity_from_counts(counts)
    return {
        "unique_artists": base["unique_count"],
        "top_artist_share": base["top_share"],
        "shannon_entropy": base["shannon_entropy"],
    }


def genre_diversity_from_counts(counts: dict[str, float]) -> dict[str, Any]:
    base = diversity_from_counts(counts)
    return {
        "unique_genres": base["unique_count"],
        "top_genre_share": base["top_share"],
        "shannon_entropy": base["shannon_entropy"],
    }


def artist_track_counts(tracks: list[MatchedTrackItem]) -> dict[str, float]:
    counts: dict[str, float] = defaultdict(float)
    for track in tracks:
        for artist in {normalize_artist(artist) for artist in track.artists}:
            if artist:
                counts[artist] += 1
    return counts


def owner_artist_counts(tracks: list[MatchedTrackItem], owner_id: str) -> dict[str, float]:
    counts: dict[str, float] = defaultdict(float)
    for track in tracks:
        if owner_id not in {item.owner_source_id for item in track.contributors}:
            continue
        for artist in {normalize_artist(artist) for artist in track.artists}:
            if artist:
                counts[artist] += 1
    return counts


def normalized_assignment(assignment: GenreAssignment) -> GenreAssignment:
    return GenreAssignment(
        genre=normalize_genre(assignment.genre),
        source=assignment.source,
        confidence=assignment.confidence,
    )


def normalize_genre(genre: str) -> str:
    return " ".join(genre.strip().lower().split())


def owner_identity(owners: dict[str, dict[str, Any]], owner_id: str) -> dict[str, str]:
    owner = owners[owner_id]
    return {
        "owner_source_id": owner["owner_source_id"],
        "owner_nickname": owner["owner_nickname"],
    }
