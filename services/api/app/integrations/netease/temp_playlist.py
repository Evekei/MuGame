from typing import Any

import httpx

NETEASE_PLAYLIST_DETAIL_URL = "https://music.163.com/api/v6/playlist/detail"


class NeteaseAuthExpired(Exception):
    pass


class NeteasePlaylistSyncFailed(Exception):
    pass


class NeteaseTempPlaylistAdapter:
    def __init__(self, timeout_seconds: float, cookies: dict[str, str], user_id: str):
        self.timeout_seconds = timeout_seconds
        self.cookies = cookies
        self.user_id = user_id

    def find_playlist_by_name(self, name: str) -> str | None:
        payload = self._get_json(
            "https://music.163.com/api/user/playlist",
            {"uid": self.user_id, "limit": "1000", "offset": "0"},
        )
        playlists = payload.get("playlist")
        if not isinstance(playlists, list):
            return None
        for playlist in playlists:
            if isinstance(playlist, dict) and playlist.get("name") == name:
                return str(playlist.get("id") or "") or None
        return None

    def create_playlist(self, name: str) -> str:
        payload = self._post_json(
            "https://music.163.com/api/playlist/create",
            {"name": name, "privacy": "0", "csrf_token": self.csrf_token()},
        )
        playlist = payload.get("playlist")
        if not isinstance(playlist, dict) or not playlist.get("id"):
            raise NeteasePlaylistSyncFailed("Missing created playlist id.")
        return str(playlist["id"])

    def get_playlist_track_ids(self, playlist_id: str) -> list[str]:
        payload = self._get_json(
            NETEASE_PLAYLIST_DETAIL_URL,
            {"id": playlist_id, "n": "1000", "s": "8"},
        )
        playlist = payload.get("playlist") or payload.get("result")
        if not isinstance(playlist, dict):
            return []
        track_ids = playlist.get("trackIds")
        if isinstance(track_ids, list):
            return [str(item.get("id")) for item in track_ids if isinstance(item, dict)]
        tracks = playlist.get("tracks")
        if isinstance(tracks, list):
            return [str(item.get("id")) for item in tracks if isinstance(item, dict)]
        return []

    def remove_tracks(self, playlist_id: str, track_ids: list[str]) -> None:
        self._manipulate_tracks("del", playlist_id, track_ids)

    def add_tracks(self, playlist_id: str, track_ids: list[str]) -> None:
        self._manipulate_tracks("add", playlist_id, track_ids)

    def _manipulate_tracks(
        self, operation: str, playlist_id: str, track_ids: list[str]
    ) -> None:
        self._post_json(
            "https://music.163.com/api/playlist/manipulate/tracks",
            {
                "op": operation,
                "pid": playlist_id,
                "trackIds": json_track_ids(track_ids),
                "csrf_token": self.csrf_token(),
            },
        )

    def _get_json(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        try:
            response = httpx.get(
                url,
                params=params,
                headers=netease_headers(),
                cookies=self.cookies,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            return checked_payload(response.json())
        except httpx.HTTPError as error:
            raise NeteasePlaylistSyncFailed("NetEase playlist request failed.") from error

    def _post_json(self, url: str, data: dict[str, str]) -> dict[str, Any]:
        try:
            response = httpx.post(
                url,
                data=data,
                headers=netease_headers(),
                cookies=self.cookies,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            return checked_payload(response.json())
        except httpx.HTTPError as error:
            raise NeteasePlaylistSyncFailed("NetEase playlist request failed.") from error

    def csrf_token(self) -> str:
        return self.cookies.get("__csrf", "")


def checked_payload(payload: dict[str, Any]) -> dict[str, Any]:
    code = payload.get("code")
    if code in {301, 302, 401}:
        raise NeteaseAuthExpired("NetEase session expired.")
    if code not in {None, 200}:
        raise NeteasePlaylistSyncFailed(str(payload.get("message") or "Sync failed."))
    return payload


def netease_headers() -> dict[str, str]:
    return {
        "Referer": "https://music.163.com/",
        "User-Agent": "MuGame Mobile",
    }


def json_track_ids(track_ids: list[str]) -> str:
    return "[" + ",".join(track_ids) + "]"
