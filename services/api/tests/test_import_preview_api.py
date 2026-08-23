from fastapi.testclient import TestClient

from app.api.imports import get_playlist_preview_adapters
from app.domain.playlist_preview import ExtractedPlaylistLink
from app.integrations.playlist_preview import PlaylistPreviewAdapter
from app.main import create_app
from app.schemas.imports import PlaylistPreviewItem


class ApiPreviewAdapter(PlaylistPreviewAdapter):
    platform = "qq"

    def preview(self, link: ExtractedPlaylistLink) -> PlaylistPreviewItem:
        return PlaylistPreviewItem(
            platform="qq",
            canonical_url=link.canonical_url,
            source_playlist_id=link.source_playlist_id,
            title="QQ 歌单",
            owner_source_id="qq-owner",
            owner_nickname="Bob",
            owner_avatar_url="https://example.test/b.png",
            cover_url="https://example.test/q.png",
            track_count=8,
            preview_status="ready",
        )


def test_import_preview_api_returns_owner_before_full_import() -> None:
    app = create_app()
    app.dependency_overrides[get_playlist_preview_adapters] = lambda: {
        "qq": ApiPreviewAdapter()
    }
    client = TestClient(app)

    response = client.post(
        "/imports/preview",
        json={
            "raw_share_texts": [
                "Bob 的 QQ 音乐歌单 https://y.qq.com/n/ryqq/playlist/8765"
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["platform"] == "qq"
    assert payload["items"][0]["owner_nickname"] == "Bob"
    assert payload["items"][0]["track_count"] == 8
