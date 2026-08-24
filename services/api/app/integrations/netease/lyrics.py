import httpx


class NeteaseLyricsClient:
    def __init__(
        self,
        timeout_seconds: float,
        cookies: dict[str, str] | None = None,
    ):
        self.timeout_seconds = timeout_seconds
        self.cookies = cookies or {}

    def fetch_lyrics(self, netease_song_id: str) -> tuple[str, str | None]:
        response = httpx.get(
            "https://music.163.com/api/song/lyric",
            params={
                "id": netease_song_id,
                "lv": "-1",
                "tv": "-1",
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
        original = str(payload.get("lrc", {}).get("lyric") or "")
        translated = str(payload.get("tlyric", {}).get("lyric") or "") or None
        return original, translated
