from fastapi.testclient import TestClient

from app.api.tracks import get_lyrics_service
from app.main import app
from app.services.lyrics import LyricsService


class FakeLyricsClient:
    def fetch_lyrics(self, track_id: str):
        assert track_id == "123"
        return "[00:01.00]Hello", "[00:01.00]你好"


class FailingLyricsClient:
    def fetch_lyrics(self, _track_id: str):
        raise RuntimeError("network")


def test_get_track_lyrics_returns_parsed_lines() -> None:
    app.dependency_overrides[get_lyrics_service] = lambda: LyricsService(
        FakeLyricsClient()
    )
    try:
        response = TestClient(app).get("/tracks/123/lyrics")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["track_id"] == "123"
    assert payload["parsed_lines"] == [
        {"time_ms": 1000, "text": "Hello", "translation": "你好"}
    ]


def test_get_track_lyrics_returns_structured_failure() -> None:
    app.dependency_overrides[get_lyrics_service] = lambda: LyricsService(
        FailingLyricsClient()
    )
    try:
        response = TestClient(app).get("/tracks/404/lyrics")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "lyric_fetch_failed"
