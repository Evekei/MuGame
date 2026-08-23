import pytest

from app.services.share_link_parser import (
    ShareLinkParseError,
    canonicalize_playlist_url,
    extract_playlist_links,
    extract_urls,
)


def test_extracts_urls_from_common_share_text() -> None:
    raw_text = "我分享了歌单《夏天》https://music.163.com/playlist?id=12345&userid=9"

    assert extract_urls(raw_text) == [
        "https://music.163.com/playlist?id=12345&userid=9"
    ]


def test_extracts_urls_pasted_without_separators() -> None:
    raw_text = (
        "https://music.163.com/playlist?id=12345"
        "https://y.qq.com/n/ryqq/playlist/8765"
    )

    assert extract_urls(raw_text) == [
        "https://music.163.com/playlist?id=12345",
        "https://y.qq.com/n/ryqq/playlist/8765",
    ]


def test_canonicalizes_netease_playlist_url() -> None:
    link = canonicalize_playlist_url(
        "https://music.163.com/playlist?id=12345&userid=9"
    )

    assert link.platform == "netease"
    assert link.canonical_url == "https://music.163.com/playlist?id=12345"
    assert link.source_playlist_id == "12345"


def test_canonicalizes_netease_hash_playlist_url() -> None:
    link = canonicalize_playlist_url(
        "https://music.163.com/#/playlist?id=67890&userid=9"
    )

    assert link.platform == "netease"
    assert link.canonical_url == "https://music.163.com/playlist?id=67890"
    assert link.source_playlist_id == "67890"


def test_canonicalizes_qq_music_playlist_url() -> None:
    link = canonicalize_playlist_url("https://y.qq.com/n/ryqq/playlist/8765")

    assert link.platform == "qq"
    assert link.canonical_url == "https://y.qq.com/n/ryqq/playlist/8765"
    assert link.source_playlist_id == "8765"


def test_canonicalizes_markdown_escaped_qq_music_url() -> None:
    link = canonicalize_playlist_url(
        "https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=9682941722\\&hosteuin="
    )

    assert link.platform == "qq"
    assert link.canonical_url == "https://y.qq.com/n/ryqq/playlist/9682941722"
    assert link.source_playlist_id == "9682941722"


def test_dedupes_same_playlist_after_canonicalization() -> None:
    links = extract_playlist_links(
        [
            "https://music.163.com/playlist?id=12345&userid=1",
            "再次粘贴 https://music.163.com/playlist?id=12345",
        ]
    )

    assert len(links) == 1
    assert links[0].canonical_url == "https://music.163.com/playlist?id=12345"


def test_rejects_unsupported_platform() -> None:
    with pytest.raises(ShareLinkParseError) as error:
        canonicalize_playlist_url("https://example.com/playlist?id=1")

    assert error.value.code == "unsupported_platform"
