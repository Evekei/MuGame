from app.domain.playlist_preview import ExtractedPlaylistLink
from app.integrations.playlist_preview import (
    NeteasePlaylistPreviewAdapter,
    parse_netease_preview,
    parse_qq_preview,
)


def test_parse_netease_preview_payload() -> None:
    link = ExtractedPlaylistLink(
        platform="netease",
        canonical_url="https://music.163.com/playlist?id=123",
        source_playlist_id="123",
    )

    item = parse_netease_preview(
        link,
        {
            "playlist": {
                "name": "Alice 的歌单",
                "coverImgUrl": "http://example.test/cover.jpg",
                "trackCount": 33,
                "creator": {
                    "userId": 42,
                    "nickname": "Alice",
                    "avatarUrl": "http://example.test/a.jpg",
                },
            }
        },
    )

    assert item.owner_nickname == "Alice"
    assert item.owner_source_id == "42"
    assert item.owner_avatar_url == "https://example.test/a.jpg"
    assert item.cover_url == "https://example.test/cover.jpg"
    assert item.track_count == 33


def test_netease_preview_adapter_passes_session_cookies(monkeypatch) -> None:
    cookies_seen = []
    urls_seen = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "result": {
                    "name": "Alice 的歌单",
                    "trackCount": 1,
                    "creator": {"userId": 1, "nickname": "Alice"},
                }
            }

    def fake_get(url, **kwargs):
        urls_seen.append(url)
        cookies_seen.append(kwargs.get("cookies"))
        return FakeResponse()

    monkeypatch.setattr("app.integrations.playlist_preview.httpx.get", fake_get)

    NeteasePlaylistPreviewAdapter(1, {"MUSIC_U": "cookie-value"}).preview(
        ExtractedPlaylistLink(
            platform="netease",
            canonical_url="https://music.163.com/playlist?id=1",
            source_playlist_id="1",
        )
    )

    assert cookies_seen == [{"MUSIC_U": "cookie-value"}]
    assert urls_seen == ["https://music.163.com/api/v6/playlist/detail"]


def test_parse_netease_preview_result_payload() -> None:
    link = ExtractedPlaylistLink(
        platform="netease",
        canonical_url="https://music.163.com/playlist?id=13482460254",
        source_playlist_id="13482460254",
    )

    item = parse_netease_preview(
        link,
        {
            "result": {
                "name": "TL 的歌单",
                "coverImgUrl": "https://example.test/cover.jpg",
                "trackCount": 100,
                "creator": {
                    "userId": 282209083,
                    "nickname": "TL的无限可能",
                    "avatarUrl": "https://example.test/avatar.jpg",
                },
            }
        },
    )

    assert item.preview_status == "ready"
    assert item.owner_nickname == "TL的无限可能"
    assert item.owner_source_id == "282209083"
    assert item.cover_url == "https://example.test/cover.jpg"
    assert item.track_count == 100


def test_parse_qq_preview_payload() -> None:
    link = ExtractedPlaylistLink(
        platform="qq",
        canonical_url="https://y.qq.com/n/ryqq/playlist/456",
        source_playlist_id="456",
    )

    item = parse_qq_preview(
        link,
        {
            "cdlist": [
                {
                    "dissname": "Bob 的歌单",
                    "logo": "http://example.test/cover.jpg",
                    "total_song_num": 12,
                    "uin": "100",
                    "nick": "Bob",
                    "headurl": "http://example.test/b.jpg",
                }
            ]
        },
    )

    assert item.owner_nickname == "Bob"
    assert item.owner_source_id == "100"
    assert item.owner_avatar_url == "https://example.test/b.jpg"
    assert item.cover_url == "https://example.test/cover.jpg"
    assert item.track_count == 12


def test_parse_qq_musicu_preview_payload() -> None:
    link = ExtractedPlaylistLink(
        platform="qq",
        canonical_url="https://y.qq.com/n/ryqq/playlist/9682941722",
        source_playlist_id="9682941722",
    )

    item = parse_qq_preview(
        link,
        {
            "req_1": {
                "code": 0,
                "data": {
                    "dirinfo": {
                        "id": 9682941722,
                        "title": "2026抖音热门歌曲｜首首好听",
                        "picurl": "https://example.test/cover.jpg",
                        "songnum": 425,
                        "encrypt_uin": "oi-5Nevloi6PNv**",
                        "host_nick": "",
                        "creator": {"nick": "", "headurl": ""},
                    }
                },
            }
        },
    )

    assert item.preview_status == "ready"
    assert item.title == "2026抖音热门歌曲｜首首好听"
    assert item.owner_source_id == "oi-5Nevloi6PNv**"
    assert item.owner_nickname == "QQ音乐歌单"
    assert item.track_count == 425
