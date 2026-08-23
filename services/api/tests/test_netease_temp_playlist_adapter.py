from app.integrations.netease.temp_playlist import NeteaseTempPlaylistAdapter


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self.payload


def test_temp_playlist_adapter_uses_v6_detail_and_csrf(monkeypatch) -> None:
    get_calls: list[tuple[str, dict[str, str]]] = []
    post_calls: list[tuple[str, dict[str, str]]] = []

    def fake_get(url, **kwargs):
        get_calls.append((url, kwargs.get("params") or {}))
        return FakeResponse({"code": 200, "playlist": {"trackIds": [{"id": 101}]}})

    def fake_post(url, **kwargs):
        post_calls.append((url, kwargs.get("data") or {}))
        return FakeResponse({"code": 200, "playlist": {"id": "temp-1"}})

    monkeypatch.setattr("app.integrations.netease.temp_playlist.httpx.get", fake_get)
    monkeypatch.setattr("app.integrations.netease.temp_playlist.httpx.post", fake_post)

    adapter = NeteaseTempPlaylistAdapter(
        1,
        {"MUSIC_U": "cookie-value", "__csrf": "csrf-value"},
        "42",
    )

    assert adapter.get_playlist_track_ids("temp-1") == ["101"]
    assert adapter.create_playlist("MusicGame") == "temp-1"
    adapter.add_tracks("temp-1", ["101"])

    assert get_calls == [
        (
            "https://music.163.com/api/v6/playlist/detail",
            {"id": "temp-1", "n": "1000", "s": "8"},
        )
    ]
    assert post_calls[0][1]["csrf_token"] == "csrf-value"
    assert post_calls[1][1]["csrf_token"] == "csrf-value"
