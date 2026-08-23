from app.domain.playlist_preview import ExtractedPlaylistLink
from app.integrations.playlist_preview import PlaylistPreviewAdapter
from app.schemas.imports import PlaylistPreviewItem
from app.services.import_preview import ImportPreviewService


class FakePreviewAdapter(PlaylistPreviewAdapter):
    platform = "netease"

    def preview(self, link: ExtractedPlaylistLink) -> PlaylistPreviewItem:
        return PlaylistPreviewItem(
            platform="netease",
            canonical_url=link.canonical_url,
            source_playlist_id=link.source_playlist_id,
            title="朋友的歌单",
            owner_source_id="owner-1",
            owner_nickname="Alice",
            owner_avatar_url="https://example.test/a.png",
            cover_url="https://example.test/c.png",
            track_count=12,
            preview_status="ready",
        )


class FailingPreviewAdapter(PlaylistPreviewAdapter):
    platform = "netease"

    def preview(self, link: ExtractedPlaylistLink) -> PlaylistPreviewItem:
        raise RuntimeError("network failed")


def test_batch_preview_keeps_success_and_failed_cards() -> None:
    service = ImportPreviewService({"netease": FakePreviewAdapter()})

    response = service.preview(
        [
            "Alice https://music.163.com/playlist?id=12345",
            "坏链接 https://example.com/not-supported",
        ]
    )

    assert [item.preview_status for item in response.items] == ["ready", "failed"]
    assert response.items[0].owner_nickname == "Alice"
    assert response.items[1].error is not None
    assert response.items[1].error.code == "unsupported_platform"


def test_batch_preview_dedupes_repeated_playlist_cards() -> None:
    service = ImportPreviewService({"netease": FakePreviewAdapter()})

    response = service.preview(
        [
            "https://music.163.com/playlist?id=12345&userid=1",
            "https://music.163.com/playlist?id=12345",
        ]
    )

    assert len(response.items) == 1
    assert response.items[0].source_playlist_id == "12345"


def test_adapter_failure_returns_retryable_failed_card() -> None:
    service = ImportPreviewService({"netease": FailingPreviewAdapter()})

    response = service.preview(["https://music.163.com/playlist?id=12345"])

    assert response.items[0].preview_status == "failed"
    assert response.items[0].canonical_url == "https://music.163.com/playlist?id=12345"
    assert response.items[0].error is not None
    assert response.items[0].error.code == "playlist_parse_failed"
