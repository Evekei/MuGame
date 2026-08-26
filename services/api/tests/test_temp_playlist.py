from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.temp_playlist import get_temp_playlist_service
from app.core.errors import AppError
from app.integrations.netease.temp_playlist import (
    NeteasePlaylistSyncFailed,
)
from app.main import create_app
from app.repositories.account_session_repository import AccountSessionRepository
from app.repositories.import_repository import ImportRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.account import NeteaseAccountProfile
from app.schemas.imports import ConfirmedSourcePlaylist, SourceTrackItem
from app.schemas.matching import NeteaseTrackCandidate
from app.services.temp_playlist import TempPlaylistService, shuffled_playback_order


class FakeTempPlaylistAdapter:
    def __init__(self):
        self.playlist_id = "temp-1"
        self.playlists: dict[str, str] = {}
        self.tracks: list[str] = []
        self.create_calls = 0
        self.fail_add_calls = 0
        self.fail_add_forever = False
        self.fail_find = False

    def find_playlist_by_name(self, name: str) -> str | None:
        if self.fail_find:
            raise NeteasePlaylistSyncFailed("playlist lookup failed")
        return self.playlists.get(name)

    def create_playlist(self, name: str) -> str:
        self.create_calls += 1
        self.playlists[name] = self.playlist_id
        return self.playlist_id

    def get_playlist_track_ids(self, _playlist_id: str) -> list[str]:
        return list(self.tracks)

    def remove_tracks(self, _playlist_id: str, track_ids: list[str]) -> None:
        self.tracks = [track_id for track_id in self.tracks if track_id not in track_ids]

    def add_tracks(self, _playlist_id: str, track_ids: list[str]) -> None:
        if self.fail_add_forever or self.fail_add_calls > 0:
            self.fail_add_calls -= 1

            raise NeteasePlaylistSyncFailed("batch failed")
        for track_id in track_ids:
            if track_id not in self.tracks:
                self.tracks.append(track_id)


def test_temp_playlist_sync_is_idempotent_and_keeps_source_data(tmp_path: Path) -> None:
    service, adapter, import_repo, _mapping_repo, session_id = sync_fixture(tmp_path)
    before = import_repo.get_session(session_id).model_dump()

    first = service.sync(session_id)
    second = service.sync(session_id)
    after = import_repo.get_session(session_id).model_dump()

    assert first.status == "ready"
    assert second.status == "ready"
    assert first.temp_playlist_id == "temp-1"
    assert second.synced_count == 2
    assert first.skipped_count == 1
    assert adapter.tracks == shuffled_playback_order(["101", "202"], session_id)
    assert adapter.create_calls == 1
    assert before["tracks"] == after["tracks"]


def test_temp_playlist_sync_retries_failed_batch(tmp_path: Path) -> None:
    service, adapter, _import_repo, _mapping_repo, session_id = sync_fixture(
        tmp_path,
        batch_size=2,
        retry_count=1,
    )
    adapter.fail_add_calls = 1

    response = service.sync(session_id)

    assert response.status == "ready"
    assert adapter.tracks == shuffled_playback_order(["101", "202"], session_id)
    assert [batch.status for batch in response.batches[-2:]] == ["failed", "ok"]
    assert [batch.attempt for batch in response.batches[-2:]] == [1, 2]


def test_temp_playlist_sync_returns_partial_failed_after_retries(tmp_path: Path) -> None:
    service, adapter, _import_repo, _mapping_repo, session_id = sync_fixture(
        tmp_path,
        batch_size=1,
        retry_count=1,
    )
    adapter.fail_add_forever = True

    response = service.sync(session_id)

    assert response.status == "partial_failed"
    assert response.synced_count == 0
    assert response.failed_count == 2
    assert response.ready_at is None
    assert response.batches[-1].status == "failed"


def test_temp_playlist_sync_auth_expired_when_session_missing(tmp_path: Path) -> None:
    service, _adapter, _import_repo, _mapping_repo, session_id = sync_fixture(
        tmp_path,
        save_account=False,
    )

    with pytest.raises(AppError) as error:
        service.sync(session_id)

    assert error.value.code == "AUTH_EXPIRED"


def test_temp_playlist_sync_duplicate_song_id_is_not_skipped(tmp_path: Path) -> None:
    service, adapter, import_repo, mapping_repo, session_id = sync_fixture(tmp_path)
    source = import_repo.list_sources(session_id)[0]
    import_repo.save_source_tracks(
        session_id,
        source,
        source_tracks() + [track("qq", "qq-duplicate", "Song D", "Dan")],
    )
    mapping_repo.save_mapping(
        "qq",
        "qq-duplicate",
        NeteaseTrackCandidate(netease_song_id="202", title="Song D", artists=["D"]),
        "manual_confirmed",
        1,
    )

    response = service.sync(session_id)

    assert response.synced_count == 2
    assert response.skipped_count == 1
    assert adapter.tracks == shuffled_playback_order(["101", "202"], session_id)


def test_temp_playlist_playback_order_is_shuffled_and_stable() -> None:
    ids = ["101", "202", "303", "404", "505"]

    first = shuffled_playback_order(ids, "session-1")
    second = shuffled_playback_order(ids, "session-1")

    assert first == second
    assert first != ids
    assert sorted(first) == sorted(ids)
    assert ids == ["101", "202", "303", "404", "505"]


def test_temp_playlist_sync_api_returns_auth_expired(tmp_path: Path) -> None:
    service, _adapter, _import_repo, _mapping_repo, session_id = sync_fixture(
        tmp_path,
        save_account=False,
    )
    app = create_app()
    app.dependency_overrides[get_temp_playlist_service] = lambda: service

    try:
        url = f"/imports/sessions/{session_id}/temp-playlist/sync"
        response = TestClient(app).post(url)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_EXPIRED"

def test_temp_playlist_sync_api_returns_sync_failed(tmp_path: Path) -> None:
    service, adapter, _import_repo, _mapping_repo, session_id = sync_fixture(tmp_path)
    adapter.fail_find = True
    app = create_app()
    app.dependency_overrides[get_temp_playlist_service] = lambda: service

    try:
        url = f"/imports/sessions/{session_id}/temp-playlist/sync"
        response = TestClient(app).post(url)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "NETEASE_SYNC_FAILED"


def sync_fixture(
    tmp_path: Path,
    batch_size: int = 200,
    retry_count: int = 1,
    save_account: bool = True,
):
    import_repo = ImportRepository(str(tmp_path / "imports.sqlite3"))
    mapping_repo = TrackMappingRepository(str(tmp_path / "mappings.sqlite3"))
    account_repo = AccountSessionRepository(str(tmp_path / "account.sqlite3"))
    session_id = "session-1"
    import_repo.create_session(session_id, [source_playlist()])
    source = import_repo.list_sources(session_id)[0]
    import_repo.save_source_tracks(session_id, source, source_tracks())
    mapping_repo.save_mapping(
        "qq",
        "qq-202",
        NeteaseTrackCandidate(netease_song_id="202", title="Song B", artists=["B"]),
        "manual_confirmed",
        1,
    )
    if save_account:
        account_repo.save_netease_session(
            {"MUSIC_U": "secret"},
            NeteaseAccountProfile(user_id="42", nickname="Alice"),
        )
    adapter = FakeTempPlaylistAdapter()
    service = TempPlaylistService(
        import_repository=import_repo,
        mapping_repository=mapping_repo,
        account_repository=account_repo,
        adapter_factory=lambda _record: adapter,
        playlist_name="MusicGame · 当前游戏",
        batch_size=batch_size,
        retry_count=retry_count,
    )
    return service, adapter, import_repo, mapping_repo, session_id


def source_playlist() -> ConfirmedSourcePlaylist:
    return ConfirmedSourcePlaylist(
        platform="netease",
        canonical_url="https://music.163.com/playlist?id=1",
        source_playlist_id="1",
        title="Alice list",
        owner_source_id="owner-a",
        owner_nickname="Alice",
    )


def source_tracks() -> list[SourceTrackItem]:
    return [
        track("netease", "101", "Song A", "Alice"),
        track("qq", "qq-202", "Song B", "Bob"),
        track("qq", "unmatched", "Song C", "Carol"),
    ]


def track(
    platform: str,
    source_track_id: str,
    title: str,
    owner_nickname: str,
) -> SourceTrackItem:
    return SourceTrackItem(
        id=f"{platform}:{source_track_id}",
        platform=platform,
        source_track_id=source_track_id,
        title=title,
        artists=[title[-1]],
        album=None,
        duration_ms=180000,
        source_playlist_id="1",
        owner_source_id=f"owner-{owner_nickname}",
        owner_nickname=owner_nickname,
    )
