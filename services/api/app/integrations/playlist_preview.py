from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.domain.playlist_preview import ExtractedPlaylistLink
from app.schemas.imports import PlaylistPreviewItem

NETEASE_PLAYLIST_DETAIL_URL = "https://music.163.com/api/v6/playlist/detail"


class PlaylistPreviewAdapter(ABC):
    platform: str

    @abstractmethod
    def preview(self, link: ExtractedPlaylistLink) -> PlaylistPreviewItem:
        raise NotImplementedError


class NeteasePlaylistPreviewAdapter(PlaylistPreviewAdapter):
    platform = "netease"

    def __init__(self, timeout_seconds: float, cookies: dict[str, str] | None = None):
        self.timeout_seconds = timeout_seconds
        self.cookies = cookies or {}

    def preview(self, link: ExtractedPlaylistLink) -> PlaylistPreviewItem:
        response = httpx.get(
            NETEASE_PLAYLIST_DETAIL_URL,
            params={"id": link.source_playlist_id, "n": "0"},
            headers={
                "Referer": "https://music.163.com/",
                "User-Agent": "MuGame Mobile",
            },
            cookies=self.cookies or None,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return parse_netease_preview(link, response.json())


class QQMusicPlaylistPreviewAdapter(PlaylistPreviewAdapter):
    platform = "qq"

    def __init__(self, timeout_seconds: float):
        self.timeout_seconds = timeout_seconds

    def preview(self, link: ExtractedPlaylistLink) -> PlaylistPreviewItem:
        response = httpx.post(
            "https://u.y.qq.com/cgi-bin/musicu.fcg",
            json=qq_musicu_payload(link.source_playlist_id, 1),
            headers=qq_headers(link.source_playlist_id),
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return parse_qq_preview(link, response.json())


def default_playlist_preview_adapters(
    timeout_seconds: float,
    netease_cookies: dict[str, str] | None = None,
) -> dict[str, PlaylistPreviewAdapter]:
    adapters: list[PlaylistPreviewAdapter] = [
        NeteasePlaylistPreviewAdapter(timeout_seconds, netease_cookies),
        QQMusicPlaylistPreviewAdapter(timeout_seconds),
    ]
    return {adapter.platform: adapter for adapter in adapters}


def parse_netease_preview(
    link: ExtractedPlaylistLink, payload: dict[str, Any]
) -> PlaylistPreviewItem:
    playlist = netease_playlist_payload(payload)
    if not isinstance(playlist, dict):
        raise ValueError("Missing NetEase playlist payload.")

    creator = playlist.get("creator")
    if not isinstance(creator, dict):
        raise ValueError("Missing NetEase playlist owner.")

    return PlaylistPreviewItem(
        platform="netease",
        canonical_url=link.canonical_url,
        source_playlist_id=link.source_playlist_id,
        title=str(playlist.get("name") or ""),
        owner_source_id=str(creator.get("userId") or ""),
        owner_nickname=str(creator.get("nickname") or ""),
        owner_avatar_url=secure_media_url(creator.get("avatarUrl")),
        cover_url=secure_media_url(playlist.get("coverImgUrl")),
        track_count=int(playlist.get("trackCount") or 0),
        preview_status="ready",
    )


def netease_playlist_payload(payload: dict[str, Any]) -> Any:
    return payload.get("playlist") or payload.get("result")


def parse_qq_preview(
    link: ExtractedPlaylistLink, payload: dict[str, Any]
) -> PlaylistPreviewItem:
    musicu_playlist = qq_musicu_dirinfo(payload)
    if isinstance(musicu_playlist, dict):
        return PlaylistPreviewItem(
            platform="qq",
            canonical_url=link.canonical_url,
            source_playlist_id=link.source_playlist_id,
            title=str(musicu_playlist.get("title") or ""),
            owner_source_id=str(
                musicu_playlist.get("encrypt_uin")
                or musicu_playlist.get("host_uin")
                or musicu_playlist.get("id")
                or ""
            ),
            owner_nickname=qq_musicu_owner_nickname(musicu_playlist),
            owner_avatar_url=secure_media_url(qq_musicu_owner_avatar(musicu_playlist)),
            cover_url=secure_media_url(musicu_playlist.get("picurl")),
            track_count=int(musicu_playlist.get("songnum") or 0),
            preview_status="ready",
        )

    cdlist = payload.get("cdlist")
    if not isinstance(cdlist, list) or not cdlist:
        raise ValueError("Missing QQ Music playlist payload.")

    playlist = cdlist[0]
    if not isinstance(playlist, dict):
        raise ValueError("Invalid QQ Music playlist payload.")

    return PlaylistPreviewItem(
        platform="qq",
        canonical_url=link.canonical_url,
        source_playlist_id=link.source_playlist_id,
        title=str(playlist.get("dissname") or ""),
        owner_source_id=str(playlist.get("uin") or ""),
        owner_nickname=str(playlist.get("nick") or ""),
        owner_avatar_url=secure_media_url(playlist.get("headurl")),
        cover_url=secure_media_url(playlist.get("logo")),
        track_count=int(playlist.get("total_song_num") or 0),
        preview_status="ready",
    )


def secure_media_url(value: Any) -> str:
    url = str(value or "")
    if url.startswith("http://"):
        return f"https://{url.removeprefix('http://')}"

    return url


def qq_musicu_payload(playlist_id: str, song_num: int) -> dict[str, Any]:
    return {
        "comm": {"ct": 24, "cv": 0},
        "req_1": {
            "module": "music.srfDissInfo.aiDissInfo",
            "method": "uniform_get_Dissinfo",
            "param": {
                "disstid": int(playlist_id) if playlist_id.isdigit() else playlist_id,
                "song_begin": 0,
                "song_num": song_num,
                "onlysonglist": 0,
                "enc_host_uin": "",
                "tag": 1,
                "sort": 5,
            },
        },
    }


def qq_headers(playlist_id: str) -> dict[str, str]:
    return {
        "Referer": "https://y.qq.com/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/120 Safari/537.36"
        ),
    }


def qq_musicu_dirinfo(payload: dict[str, Any]) -> Any:
    req = payload.get("req_1")
    if not isinstance(req, dict) or req.get("code") != 0:
        return None

    data = req.get("data")
    if not isinstance(data, dict):
        return None

    return data.get("dirinfo")


def qq_musicu_owner_nickname(playlist: dict[str, Any]) -> str:
    creator = playlist.get("creator")
    if not isinstance(creator, dict):
        creator = {}

    return str(
        playlist.get("host_nick")
        or creator.get("nick")
        or playlist.get("origin_title")
        or "QQ音乐歌单"
    )


def qq_musicu_owner_avatar(playlist: dict[str, Any]) -> Any:
    creator = playlist.get("creator")
    if isinstance(creator, dict) and creator.get("headurl"):
        return creator.get("headurl")

    return playlist.get("headurl")
