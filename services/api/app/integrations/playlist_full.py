from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Any
import uuid

import httpx

from app.integrations.playlist_preview import (
    qq_headers,
    qq_musicu_payload,
    secure_media_url,
)
from app.schemas.imports import ConfirmedSourcePlaylist, SourceTrackItem

ProgressCallback = Callable[[int, int | None], None]
NETEASE_PLAYLIST_DETAIL_URL = "https://music.163.com/api/v6/playlist/detail"


class FullPlaylistAdapter(ABC):
    platform: str

    @abstractmethod
    def fetch_full_playlist(
        self, source: ConfirmedSourcePlaylist, on_progress: ProgressCallback
    ) -> list[SourceTrackItem]:
        raise NotImplementedError


class NeteaseFullPlaylistAdapter(FullPlaylistAdapter):
    platform = "netease"

    def __init__(self, timeout_seconds: float, cookies: dict[str, str] | None = None):
        self.timeout_seconds = timeout_seconds
        self.cookies = cookies or {}

    def fetch_full_playlist(
        self, source: ConfirmedSourcePlaylist, on_progress: ProgressCallback
    ) -> list[SourceTrackItem]:
        detail = self._get_json(
            NETEASE_PLAYLIST_DETAIL_URL,
            {"id": source.source_playlist_id, "n": "1000", "s": "8"},
        )
        playlist = detail.get("playlist") or detail.get("result")
        if not isinstance(playlist, dict):
            raise ValueError("Missing NetEase playlist payload.")

        track_ids = parse_netease_track_ids(playlist)
        tracks = parse_netease_tracks(source, playlist.get("tracks") or [])
        total = len(track_ids) or source.track_count
        on_progress(len(tracks), total)

        if track_ids and len(tracks) < len(track_ids):
            tracks_by_id = {track.source_track_id: track for track in tracks}
            for chunk in chunked(track_ids, 200):
                payload = self._get_json(
                    "https://music.163.com/api/song/detail",
                    {"ids": json_ids(chunk)},
                )
                for track in parse_netease_tracks(source, payload.get("songs") or []):
                    tracks_by_id[track.source_track_id] = track
                tracks = list(tracks_by_id.values())
                on_progress(len(tracks), total)

        return tracks

    def _get_json(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        response = httpx.get(
            url,
            params=params,
            headers={
                "Referer": "https://music.163.com/",
                "User-Agent": "MuGame Mobile",
            },
            cookies=self.cookies or None,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()


class QQMusicFullPlaylistAdapter(FullPlaylistAdapter):
    platform = "qq"

    def __init__(self, timeout_seconds: float):
        self.timeout_seconds = timeout_seconds

    def fetch_full_playlist(
        self, source: ConfirmedSourcePlaylist, on_progress: ProgressCallback
    ) -> list[SourceTrackItem]:
        response = httpx.post(
            "https://u.y.qq.com/cgi-bin/musicu.fcg",
            json=qq_musicu_payload(source.source_playlist_id, source.track_count or 1000),
            headers=qq_headers(source.source_playlist_id),
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        tracks = parse_qq_tracks(source, response.json())
        on_progress(len(tracks), source.track_count or len(tracks))
        return tracks


def default_full_playlist_adapters(
    timeout_seconds: float,
    netease_cookies: dict[str, str] | None = None,
) -> dict[str, FullPlaylistAdapter]:
    adapters: list[FullPlaylistAdapter] = [
        NeteaseFullPlaylistAdapter(timeout_seconds, netease_cookies),
        QQMusicFullPlaylistAdapter(timeout_seconds),
    ]
    return {adapter.platform: adapter for adapter in adapters}


def parse_netease_track_ids(playlist: dict[str, Any]) -> list[str]:
    track_ids = playlist.get("trackIds")
    if not isinstance(track_ids, list):
        return []
    return [str(item.get("id")) for item in track_ids if isinstance(item, dict)]


def parse_netease_tracks(
    source: ConfirmedSourcePlaylist, tracks_payload: Any
) -> list[SourceTrackItem]:
    if not isinstance(tracks_payload, list):
        return []

    return [
        source_track(
            source,
            source_track_id=str(track.get("id") or ""),
            title=str(track.get("name") or ""),
            artists=parse_netease_artists(track),
            album=parse_netease_album(track),
            duration_ms=int(track.get("duration") or track.get("dt") or 0) or None,
            cover_url=parse_netease_cover(track),
        )
        for track in tracks_payload
        if isinstance(track, dict) and track.get("id") and track.get("name")
    ]


def parse_qq_tracks(
    source: ConfirmedSourcePlaylist, payload: dict[str, Any]
) -> list[SourceTrackItem]:
    musicu_songlist = qq_musicu_songlist(payload)
    if isinstance(musicu_songlist, list):
        return [
            source_track(
                source,
                source_track_id=str(song.get("mid") or song.get("id") or ""),
                title=str(song.get("title") or song.get("name") or ""),
                artists=parse_qq_artists(song),
                album=parse_qq_album(song),
                duration_ms=seconds_to_ms(song.get("interval")),
                cover_url=parse_qq_cover(song),
            )
            for song in musicu_songlist
            if isinstance(song, dict) and (song.get("mid") or song.get("id"))
        ]

    cdlist = payload.get("cdlist")
    if not isinstance(cdlist, list) or not cdlist or not isinstance(cdlist[0], dict):
        raise ValueError("Missing QQ Music playlist payload.")

    songlist = cdlist[0].get("songlist")
    if not isinstance(songlist, list):
        return []

    return [
        source_track(
            source,
            source_track_id=str(song.get("songmid") or song.get("songid") or ""),
            title=str(song.get("songname") or song.get("name") or ""),
            artists=parse_qq_artists(song),
            album=str(song.get("albumname") or ""),
            duration_ms=seconds_to_ms(song.get("interval")),
            cover_url=None,
        )
        for song in songlist
        if isinstance(song, dict) and (song.get("songmid") or song.get("songid"))
    ]


def source_track(
    source: ConfirmedSourcePlaylist,
    source_track_id: str,
    title: str,
    artists: list[str],
    album: str | None,
    duration_ms: int | None,
    cover_url: str | None,
) -> SourceTrackItem:
    return SourceTrackItem(
        id=str(uuid.uuid4()),
        platform=source.platform,
        source_track_id=source_track_id,
        title=title,
        artists=artists,
        album=album or None,
        duration_ms=duration_ms,
        cover_url=secure_media_url(cover_url),
        source_playlist_id=source.source_playlist_id,
        owner_source_id=source.owner_source_id,
        owner_nickname=source.owner_nickname,
        owner_avatar_url=source.owner_avatar_url,
    )


def parse_netease_artists(track: dict[str, Any]) -> list[str]:
    artists = track.get("artists") or track.get("ar") or []
    return [str(artist.get("name")) for artist in artists if isinstance(artist, dict)]


def parse_netease_album(track: dict[str, Any]) -> str | None:
    album = track.get("album") or track.get("al")
    if isinstance(album, dict):
        return str(album.get("name") or "") or None
    return None


def parse_netease_cover(track: dict[str, Any]) -> str | None:
    album = track.get("album") or track.get("al")
    if isinstance(album, dict):
        return str(album.get("picUrl") or "") or None
    return None


def parse_qq_artists(song: dict[str, Any]) -> list[str]:
    singers = song.get("singer") or []
    return [str(singer.get("name")) for singer in singers if isinstance(singer, dict)]


def qq_musicu_songlist(payload: dict[str, Any]) -> Any:
    req = payload.get("req_1")
    if not isinstance(req, dict) or req.get("code") != 0:
        return None

    data = req.get("data")
    if not isinstance(data, dict):
        return None

    return data.get("songlist")


def parse_qq_album(song: dict[str, Any]) -> str | None:
    album = song.get("album")
    if isinstance(album, dict):
        return str(album.get("title") or album.get("name") or "") or None

    return str(song.get("albumname") or "") or None


def parse_qq_cover(song: dict[str, Any]) -> str | None:
    album = song.get("album")
    if not isinstance(album, dict):
        return None

    pmid = album.get("pmid") or album.get("mid")
    if not pmid:
        return None

    return f"https://y.gtimg.cn/music/photo_new/T002R300x300M000{pmid}.jpg"


def seconds_to_ms(value: Any) -> int | None:
    try:
        seconds = int(value or 0)
    except (TypeError, ValueError):
        return None
    return seconds * 1000 if seconds else None


def json_ids(track_ids: list[str]) -> str:
    return "[" + ",".join(track_ids) + "]"


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]
