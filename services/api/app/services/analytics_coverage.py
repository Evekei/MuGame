from typing import Any

from app.schemas.matching import MatchedTrackItem
from app.services.analytics_math import ratio
from app.services.analytics_v1 import normalize_artist


def album_coverage(tracks: list[MatchedTrackItem]) -> dict[str, Any]:
    total = len(tracks)
    known = sum(1 for track in tracks if normalize_album(track.album))
    return {"known_track_count": known, "total_track_count": total, "ratio": ratio(known, total)}


def artist_coverage(tracks: list[MatchedTrackItem]) -> dict[str, Any]:
    total = len(tracks)
    known = sum(1 for track in tracks if any(normalize_artist(artist) for artist in track.artists))
    return {"known_track_count": known, "total_track_count": total, "ratio": ratio(known, total)}


def normalize_album(album: str | None) -> str:
    return " ".join((album or "").strip().lower().split())
