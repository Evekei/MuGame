from typing import Any

import httpx

from app.schemas.dedupe import UnifiedTrackItem
from app.schemas.matching import NeteaseTrackCandidate


class NeteaseSearchRateLimited(Exception):
    pass


class NeteaseTrackSearchAdapter:
    def __init__(
        self,
        timeout_seconds: float,
        cookies: dict[str, str] | None = None,
    ):
        self.timeout_seconds = timeout_seconds
        self.cookies = cookies or {}

    def search_track(self, track: UnifiedTrackItem, limit: int = 5) -> list[NeteaseTrackCandidate]:
        response = httpx.get(
            "https://music.163.com/api/search/get/web",
            params={
                "s": search_query(track),
                "type": "1",
                "limit": str(limit),
                "offset": "0",
            },
            headers={
                "Referer": "https://music.163.com/",
                "User-Agent": "MuGame Mobile",
            },
            cookies=self.cookies or None,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if is_rate_limited(payload):
            raise NeteaseSearchRateLimited("NetEase search rate limited.")
        return parse_search_candidates(payload)[:limit]


def search_query(track: UnifiedTrackItem) -> str:
    artists = " ".join(track.artists[:2])
    return f"{track.display_title} {artists}".strip()


def parse_search_candidates(payload: dict[str, Any]) -> list[NeteaseTrackCandidate]:
    songs = payload.get("result", {}).get("songs", [])
    if not isinstance(songs, list):
        return []

    return [candidate_from_song(song) for song in songs if isinstance(song, dict)]


def is_rate_limited(payload: dict[str, Any]) -> bool:
    message = str(payload.get("msg") or payload.get("message") or "")
    return payload.get("code") == 405 or "操作频繁" in message


def candidate_from_song(song: dict[str, Any]) -> NeteaseTrackCandidate:
    album = song.get("album")
    return NeteaseTrackCandidate(
        netease_song_id=str(song.get("id") or ""),
        title=str(song.get("name") or ""),
        artists=parse_artists(song.get("artists") or song.get("ar") or []),
        album=parse_album_name(album),
        duration_ms=int(song.get("duration") or song.get("dt") or 0) or None,
        score=0,
        reason="unscored_search_result",
    )


def parse_artists(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item.get("name")) for item in value if isinstance(item, dict)]


def parse_album_name(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    return str(value.get("name") or "") or None
