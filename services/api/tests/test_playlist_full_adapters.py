from app.integrations.playlist_full import NeteaseFullPlaylistAdapter, parse_qq_tracks
from app.schemas.imports import ConfirmedSourcePlaylist


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self.payload


def test_netease_full_adapter_fetches_missing_tracks_by_batches(monkeypatch) -> None:
    requests: list[tuple[str, dict[str, str]]] = []
    cookies_seen: list[dict[str, str] | None] = []

    def fake_get(url, **kwargs):
        requests.append((url, kwargs.get("params") or {}))
        cookies_seen.append(kwargs.get("cookies"))
        if "playlist/detail" in url:
            return FakeResponse(
                {
                    "playlist": {
                        "trackIds": [{"id": 1}, {"id": 2}],
                        "tracks": [],
                    }
                }
            )
        return FakeResponse(
            {
                "songs": [
                    netease_song(1, "第一首"),
                    netease_song(2, "第二首"),
                ]
            }
        )

    monkeypatch.setattr("app.integrations.playlist_full.httpx.get", fake_get)

    progress: list[tuple[int, int | None]] = []
    tracks = NeteaseFullPlaylistAdapter(1, {"MUSIC_U": "cookie-value"}).fetch_full_playlist(
        source_playlist(),
        lambda read_count, total: progress.append((read_count, total)),
    )

    assert requests == [
        (
            "https://music.163.com/api/v6/playlist/detail",
            {"id": "1", "n": "1000", "s": "8"},
        ),
        ("https://music.163.com/api/song/detail", {"ids": "[1,2]"}),
    ]
    assert cookies_seen == [
        {"MUSIC_U": "cookie-value"},
        {"MUSIC_U": "cookie-value"},
    ]
    assert [track.title for track in tracks] == ["第一首", "第二首"]
    assert {track.owner_nickname for track in tracks} == {"Alice"}
    assert progress[-1] == (2, 2)


def source_playlist() -> ConfirmedSourcePlaylist:
    return ConfirmedSourcePlaylist(
        platform="netease",
        canonical_url="https://music.163.com/playlist?id=1",
        source_playlist_id="1",
        title="Alice 的歌单",
        owner_source_id="owner-a",
        owner_nickname="Alice",
        track_count=2,
    )


def netease_song(song_id: int, title: str) -> dict[str, object]:
    return {
        "id": song_id,
        "name": title,
        "ar": [{"name": "Artist"}],
        "al": {"name": "Album", "picUrl": "http://example.test/cover.jpg"},
        "dt": 120000,
    }


def test_parse_qq_musicu_tracks() -> None:
    source = ConfirmedSourcePlaylist(
        platform="qq",
        canonical_url="https://y.qq.com/n/ryqq/playlist/9682941722",
        source_playlist_id="9682941722",
        title="QQ 歌单",
        owner_source_id="owner",
        owner_nickname="Bob",
        track_count=1,
    )

    tracks = parse_qq_tracks(
        source,
        {
            "req_1": {
                "code": 0,
                "data": {
                    "songlist": [
                        {
                            "id": 496054946,
                            "mid": "001auUcH4WQs2V",
                            "title": "恋人",
                            "interval": 275,
                            "singer": [{"name": "李荣浩"}],
                            "album": {
                                "title": "黑马",
                                "pmid": "004HaG7p4ZkhXA_1",
                            },
                        }
                    ]
                },
            }
        },
    )

    assert len(tracks) == 1
    assert tracks[0].source_track_id == "001auUcH4WQs2V"
    assert tracks[0].title == "恋人"
    assert tracks[0].artists == ["李荣浩"]
    assert tracks[0].album == "黑马"
    assert tracks[0].duration_ms == 275000
