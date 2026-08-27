from pathlib import Path

from fastapi.testclient import TestClient

from app.api.imports import (
    get_full_playlist_adapters,
    get_import_repository,
    get_track_matching_service,
)
from app.domain.track_matching import MatchThresholds
from app.integrations.netease.track_search import NeteaseSearchRateLimited
from app.integrations.playlist_full import FullPlaylistAdapter
from app.main import app
from app.repositories.import_repository import ImportRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.imports import SourceTrackItem
from app.schemas.matching import NeteaseTrackCandidate
from app.services.track_matching import TrackMatchingService


class FakeFullAdapter(FullPlaylistAdapter):
    platform = "netease"

    def fetch_full_playlist(self, source, on_progress):
        total = source.track_count or 1
        on_progress(total, source.track_count)
        return [
            SourceTrackItem(
                id=f"track-{source.source_playlist_id}-{index}",
                platform=source.platform,
                source_track_id=f"song-{source.source_playlist_id}"
                if total == 1
                else f"song-{source.source_playlist_id}-{index}",
                title="共同歌曲" if total == 1 else f"歌曲 {index}",
                artists=["Artist"],
                album=None,
                duration_ms=1000,
                cover_url=None,
                source_playlist_id=source.source_playlist_id,
                owner_source_id=source.owner_source_id,
                owner_nickname=source.owner_nickname,
            )
            for index in range(total)
        ]


class FakeSearchAdapter:
    def search_track(self, _track, limit=5):
        return [
            NeteaseTrackCandidate(
                netease_song_id="netease-1",
                title="共同歌曲",
                artists=["Artist"],
                album="Other",
                duration_ms=900000,
            )
        ][:limit]


class RateLimitedSearchAdapter:
    def search_track(self, _track, limit=5):
        raise NeteaseSearchRateLimited("rate limited")


def test_full_import_api_creates_session_and_tracks(tmp_path: Path) -> None:
    repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    app.dependency_overrides[get_import_repository] = lambda: repository
    app.dependency_overrides[get_full_playlist_adapters] = lambda: {
        "netease": FakeFullAdapter()
    }

    try:
        client = TestClient(app)
        response = client.post(
            "/imports/full",
            json={
                "source_playlists": [
                    source_payload("1", "owner-a", "Alice"),
                    source_payload("2", "owner-b", "Bob"),
                ]
            },
        )

        assert response.status_code == 200
        session_id = response.json()["id"]
        session = client.get(f"/imports/sessions/{session_id}").json()
        deduped = client.post(f"/imports/sessions/{session_id}/dedupe").json()
    finally:
        app.dependency_overrides.clear()

    assert session["status"] == "ready"
    assert session["raw_track_count"] == 2
    assert [track["owner_nickname"] for track in session["tracks"]] == [
        "Alice",
        "Bob",
    ]
    assert deduped["raw_track_count"] == 2
    assert deduped["unique_track_count"] == 1
    assert [item["owner_nickname"] for item in deduped["tracks"][0]["contributors"]] == [
        "Alice",
        "Bob",
    ]


def test_full_import_api_limits_tracks_per_source_playlist(tmp_path: Path) -> None:
    repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    app.dependency_overrides[get_import_repository] = lambda: repository
    app.dependency_overrides[get_full_playlist_adapters] = lambda: {
        "netease": FakeFullAdapter()
    }

    try:
        client = TestClient(app)
        response = client.post(
            "/imports/full",
            json={
                "source_playlists": [
                    source_payload(
                        "1",
                        "owner-a",
                        "Alice",
                        track_count=5,
                        import_track_limit=2,
                    )
                ]
            },
        )
        session_id = response.json()["id"]
        session = client.get(f"/imports/sessions/{session_id}").json()
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert session["status"] == "ready"
    assert session["raw_track_count"] == 2
    assert session["source_playlists"][0]["import_track_limit"] == 2
    assert session["source_playlists"][0]["read_count"] == 2
    assert len(session["tracks"]) == 2


def test_match_api_returns_candidates_and_confirm_writes_cache(tmp_path: Path) -> None:
    import_repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    mapping_repository = TrackMappingRepository(str(tmp_path / "mappings.sqlite3"))
    app.dependency_overrides[get_import_repository] = lambda: import_repository
    app.dependency_overrides[get_full_playlist_adapters] = lambda: {
        "qq": FakeFullAdapter()
    }
    app.dependency_overrides[get_track_matching_service] = lambda: TrackMatchingService(
        search_adapter=FakeSearchAdapter(),
        mapping_repository=mapping_repository,
        thresholds=MatchThresholds(auto_accept=0.86, need_confirm=0.65),
        concurrency_limit=2,
    )

    try:
        client = TestClient(app)
        full_response = client.post(
            "/imports/full",
            json={"source_playlists": [source_payload("1", "owner-a", "Alice", "qq")]},
        )
        session_id = full_response.json()["id"]

        match_response = client.post(f"/imports/sessions/{session_id}/match")
        matched_track = match_response.json()["tracks"][0]
        candidate = matched_track["candidates"][0]
        confirm_response = client.post(
            f"/imports/sessions/{session_id}/matches/confirm",
            json={
                "source_track_ids": matched_track["source_track_ids"],
                "netease_song_id": candidate["netease_song_id"],
                "title": candidate["title"],
                "artists": candidate["artists"],
                "album": candidate["album"],
                "duration_ms": candidate["duration_ms"],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert match_response.status_code == 200
    assert matched_track["match_status"] == "needs_confirm"
    assert matched_track["contributors"][0]["owner_nickname"] == "Alice"
    assert confirm_response.status_code == 200
    assert confirm_response.json()["match_status"] == "manual_confirmed"
    cached = mapping_repository.get_mapping("qq", "song-1")
    assert cached is not None
    assert cached.candidate.netease_song_id == "netease-1"
    assert cached.match_status == "manual_confirmed"


def test_match_job_api_returns_progress_and_result(tmp_path: Path) -> None:
    import_repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    mapping_repository = TrackMappingRepository(str(tmp_path / "mappings.sqlite3"))
    app.dependency_overrides[get_import_repository] = lambda: import_repository
    app.dependency_overrides[get_full_playlist_adapters] = lambda: {
        "qq": FakeFullAdapter()
    }
    app.dependency_overrides[get_track_matching_service] = lambda: TrackMatchingService(
        search_adapter=FakeSearchAdapter(),
        mapping_repository=mapping_repository,
        thresholds=MatchThresholds(auto_accept=0.86, need_confirm=0.65),
        concurrency_limit=2,
    )

    try:
        client = TestClient(app)
        full_response = client.post(
            "/imports/full",
            json={"source_playlists": [source_payload("1", "owner-a", "Alice", "qq")]},
        )
        session_id = full_response.json()["id"]

        start_response = client.post(f"/imports/sessions/{session_id}/match-jobs")
        job_id = start_response.json()["id"]
        job_response = client.get(f"/imports/match-jobs/{job_id}")
    finally:
        app.dependency_overrides.clear()

    assert start_response.status_code == 200
    assert start_response.json()["total_track_count"] == 1
    assert job_response.status_code == 200
    assert job_response.json()["status"] == "ready"
    assert job_response.json()["processed_track_count"] == 1
    assert job_response.json()["result"]["tracks"][0]["match_status"] == "needs_confirm"


def test_match_job_api_reports_rate_limited_without_no_match(tmp_path: Path) -> None:
    import_repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    app.dependency_overrides[get_import_repository] = lambda: import_repository
    app.dependency_overrides[get_full_playlist_adapters] = lambda: {
        "qq": FakeFullAdapter()
    }
    app.dependency_overrides[get_track_matching_service] = lambda: TrackMatchingService(
        search_adapter=RateLimitedSearchAdapter(),
        mapping_repository=TrackMappingRepository(str(tmp_path / "mappings.sqlite3")),
        thresholds=MatchThresholds(auto_accept=0.86, need_confirm=0.65),
        concurrency_limit=3,
    )

    try:
        client = TestClient(app)
        full_response = client.post(
            "/imports/full",
            json={"source_playlists": [source_payload("1", "owner-a", "Alice", "qq")]},
        )
        session_id = full_response.json()["id"]

        start_response = client.post(f"/imports/sessions/{session_id}/match-jobs")
        job_response = client.get(f"/imports/match-jobs/{start_response.json()['id']}")
    finally:
        app.dependency_overrides.clear()

    assert job_response.status_code == 200
    assert job_response.json()["status"] == "rate_limited"
    assert job_response.json()["no_match_count"] == 0
    assert "操作频繁" in job_response.json()["error"]


def source_payload(
    playlist_id: str,
    owner_id: str,
    owner_name: str,
    platform: str = "netease",
    track_count: int = 1,
    import_track_limit: int | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "platform": platform,
        "canonical_url": canonical_url(platform, playlist_id),
        "source_playlist_id": playlist_id,
        "title": f"{owner_name} 的歌单",
        "owner_source_id": owner_id,
        "owner_nickname": owner_name,
        "track_count": track_count,
    }
    if import_track_limit is not None:
        payload["import_track_limit"] = import_track_limit
    return payload


def canonical_url(platform: str, playlist_id: str) -> str:
    if platform == "qq":
        return f"https://y.qq.com/n/ryqq/playlist/{playlist_id}"
    return f"https://music.163.com/playlist?id={playlist_id}"
