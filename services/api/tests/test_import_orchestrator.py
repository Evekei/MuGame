from pathlib import Path
import sqlite3
import time

from fastapi.testclient import TestClient

from app.api.imports import get_import_orchestrator, get_import_repository
from app.domain.track_matching import MatchThresholds
from app.integrations.netease.temp_playlist import NeteasePlaylistSyncFailed
from app.integrations.playlist_full import FullPlaylistAdapter
from app.repositories.account_session_repository import AccountSessionRepository
from app.repositories.import_repository import ImportRepository
from app.repositories.orchestration_repository import OrchestrationRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.account import NeteaseAccountProfile
from app.schemas.imports import ConfirmedSourcePlaylist, FullImportRequest, SourceTrackItem
from app.schemas.matching import NeteaseTrackCandidate
from app.services.analytics import AnalyticsService
from app.services.full_import import FullImportService
from app.services.import_orchestrator import ImportOrchestrator
from app.services.temp_playlist import TempPlaylistService, shuffled_playback_order
from app.services.track_dedupe import TrackDedupeService
from app.services.track_matching import TrackMatchingService
from app.main import create_app


class FakeFullAdapter(FullPlaylistAdapter):
    platform = "netease"

    def fetch_full_playlist(self, source, on_progress):
        total = source.track_count or 1
        on_progress(total, source.track_count)
        return [
            SourceTrackItem(
                id=f"{source.platform}:{source.source_playlist_id}:{index}",
                platform=source.platform,
                source_track_id=source.source_playlist_id
                if total == 1
                else f"{source.source_playlist_id}-{index}",
                title="共同歌曲" if total == 1 else f"歌曲 {index}",
                artists=["Artist"],
                album="Album",
                duration_ms=180000,
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


class FakeTempPlaylistAdapter:
    def __init__(self):
        self.playlists = {}
        self.tracks = []
        self.fail_add_forever = False

    def find_playlist_by_name(self, name):
        return self.playlists.get(name)

    def create_playlist(self, name):
        self.playlists[name] = "temp-1"
        return "temp-1"

    def get_playlist_track_ids(self, _playlist_id):
        return list(self.tracks)

    def remove_tracks(self, _playlist_id, track_ids):
        self.tracks = [track for track in self.tracks if track not in track_ids]

    def add_tracks(self, _playlist_id, track_ids):
        if self.fail_add_forever:
            raise NeteasePlaylistSyncFailed("batch failed")
        self.tracks.extend(track_ids)


def test_orchestrator_ready_to_play_does_not_wait_for_slow_analytics(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, adapter = orchestrator_fixture(
        tmp_path,
        analytics_delay_seconds=30,
    )
    started = time.monotonic()

    session = orchestrator.start(
        FullImportRequest(
            source_playlists=[
                source_playlist("101", "owner-a", "Alice"),
                source_playlist("202", "owner-b", "Bob"),
            ]
        )
    )
    ready = poll_session(import_repo, session.id, "ready_to_play")

    assert time.monotonic() - started < 2
    assert ready.status == "ready_to_play"
    assert ready.analytics_status in {"pending", "running"}
    assert ready.playback is not None
    assert ready.playback.temp_playlist_id == "temp-1"
    assert [item.owner_nickname for item in ready.playback.tracks[0].contributors] == [
        "Alice",
        "Bob",
    ]
    assert adapter.tracks == shuffled_playback_order(["101"], session.id)


def test_orchestrator_skips_needs_confirm_tracks_when_syncing(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, adapter = orchestrator_fixture(
        tmp_path,
        platform="qq",
    )

    session = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("qq-1", "owner-a", "Alice", "qq")])
    )
    ready = poll_session(import_repo, session.id, "ready_to_play")

    assert ready.status == "ready_to_play"
    assert ready.progress is not None
    assert ready.progress.sync.total == 0
    assert ready.matched_tracks[0].match_status == "needs_confirm"
    assert adapter.tracks == []


def test_analytics_failure_does_not_fail_ready_import(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, _adapter = orchestrator_fixture(
        tmp_path,
        analytics_fail=True,
    )

    session = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("101", "owner-a", "Alice")])
    )
    ready = poll_session(import_repo, session.id, "ready_to_play")
    failed_analytics = poll_analytics(import_repo, session.id, "failed")

    assert ready.status == "ready_to_play"
    assert failed_analytics.status == "ready_to_play"
    assert failed_analytics.analytics_status == "failed"


def test_retry_resumes_failed_sync_stage_without_rereading_sources(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, adapter = orchestrator_fixture(tmp_path)
    adapter.fail_add_forever = True

    session = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("101", "owner-a", "Alice")])
    )
    failed = poll_session(import_repo, session.id, "failed")
    read_count = failed.progress.read.current
    adapter.fail_add_forever = False

    retried = orchestrator.retry(session.id)
    ready = poll_session(import_repo, retried.id, "ready_to_play")

    assert failed.failed_stage == "syncing_temp"
    assert ready.status == "ready_to_play"
    assert ready.progress.read.current == read_count
    assert adapter.tracks == shuffled_playback_order(["101"], session.id)


def test_orchestration_state_is_persistent_across_repository_instances(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, _adapter = orchestrator_fixture(tmp_path)

    session = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("101", "owner-a", "Alice")])
    )
    poll_session(import_repo, session.id, "ready_to_play")
    next_repository = ImportRepository(str(tmp_path / "mugame.sqlite3"))
    restored = next_repository.get_session(session.id)

    assert restored.status == "ready_to_play"
    assert restored.playback is not None
    assert restored.analytics_job_id is not None
    assert restored.matched_tracks[0].contributors[0].owner_nickname == "Alice"


def test_progress_counts_are_persistent_and_monotonic(tmp_path: Path):
    db_path = str(tmp_path / "mugame.sqlite3")
    import_repo = ImportRepository(db_path)
    orchestration_repo = OrchestrationRepository(db_path)
    session_id = "session-monotonic"
    import_repo.create_session(
        session_id,
        [source_playlist("101", "owner-a", "Alice", track_count=2)],
    )
    source = import_repo.list_sources(session_id)[0]
    snapshots = []

    orchestration_repo.create_orchestration(session_id, "importing")
    snapshots.append(progress_counts(import_repo, session_id))
    import_repo.mark_source_reading(source.id, 2, read_count=1)
    snapshots.append(progress_counts(import_repo, session_id))
    import_repo.save_source_tracks(
        session_id,
        source,
        [
            source_track("101", "Alice"),
            source_track("102", "Alice"),
        ],
    )
    snapshots.append(progress_counts(import_repo, session_id))
    orchestration_repo.mark_matching(session_id, 2)
    snapshots.append(progress_counts(import_repo, session_id))
    orchestration_repo.increment_matched(session_id)
    snapshots.append(progress_counts(import_repo, session_id))
    orchestration_repo.increment_matched(session_id)
    snapshots.append(progress_counts(import_repo, session_id))
    orchestration_repo.mark_syncing(session_id, 2)
    snapshots.append(progress_counts(import_repo, session_id))
    orchestration_repo.mark_ready(session_id, "temp-1", synced_count=2, sync_total=2)
    snapshots.append(progress_counts(import_repo, session_id))
    restored = ImportRepository(db_path).get_session(session_id)

    assert restored.status == "ready_to_play"
    assert restored.progress.read.total == 2
    assert restored.progress.match.total == 2
    assert restored.progress.sync.total == 2
    assert_progress_monotonic(snapshots)


def test_orchestration_api_starts_and_reads_ready_session(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, _adapter = orchestrator_fixture(tmp_path)
    app = create_app()
    app.dependency_overrides[get_import_orchestrator] = lambda: orchestrator
    app.dependency_overrides[get_import_repository] = lambda: import_repo

    try:
        client = TestClient(app)
        response = client.post(
            "/imports/orchestrations",
            json={"source_playlists": [source_playlist_payload("101", "owner-a", "Alice")]},
        )
        session_id = response.json()["id"]
        ready = poll_client_session(client, session_id, "ready_to_play")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert ready["status"] == "ready_to_play"
    assert ready["playback"]["temp_playlist_id"] == "temp-1"
    assert ready["matched_tracks"][0]["contributors"][0]["owner_nickname"] == "Alice"


def test_import_history_lists_ready_sessions_in_recent_order(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, _adapter = orchestrator_fixture(tmp_path)

    first = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("101", "owner-a", "Alice")])
    )
    poll_session(import_repo, first.id, "ready_to_play")
    second = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("202", "owner-b", "Bob")])
    )
    poll_session(import_repo, second.id, "ready_to_play")
    third = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("303", "owner-c", "Cara")])
    )
    poll_session(import_repo, third.id, "ready_to_play")
    import_repo.create_session(
        "pending-session",
        [source_playlist("404", "owner-d", "Dana")],
    )

    history = import_repo.list_history(limit=2)

    assert [item.session_id for item in history] == [third.id, second.id]
    assert history[0].temp_playlist_id == "temp-1"
    assert history[0].playable_track_count == 1
    assert history[0].owner_nicknames == ["Cara"]


def test_restore_history_resyncs_temp_playlist_without_new_analytics(
    tmp_path: Path,
):
    orchestrator, import_repo, _mapping_repo, adapter = orchestrator_fixture(tmp_path)
    session = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("101", "owner-a", "Alice")])
    )
    ready = poll_session(import_repo, session.id, "ready_to_play")
    adapter.tracks = ["stale-song"]
    orchestrator.full_import_service.run_import = fail_if_called
    orchestrator.matching_service.match_tracks = fail_if_called

    restored = orchestrator.restore_temp_playlist(session.id)

    assert restored.status == "ready_to_play"
    assert restored.analytics_job_id == ready.analytics_job_id
    assert adapter.tracks == shuffled_playback_order(["101"], session.id)
    assert restored.playback is not None
    assert restored.playback.tracks[0].contributors[0].owner_nickname == "Alice"


def test_import_history_api_restores_and_deletes_session(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, adapter = orchestrator_fixture(tmp_path)
    session = orchestrator.start(
        FullImportRequest(source_playlists=[source_playlist("101", "owner-a", "Alice")])
    )
    poll_session(import_repo, session.id, "ready_to_play")
    app = create_app()
    app.dependency_overrides[get_import_orchestrator] = lambda: orchestrator
    app.dependency_overrides[get_import_repository] = lambda: import_repo

    try:
        client = TestClient(app)
        history_response = client.get("/imports/history?limit=20")
        adapter.tracks = ["current-song"]
        restore_response = client.post(
            f"/imports/sessions/{session.id}/restore-temp-playlist"
        )
        delete_response = client.delete(f"/imports/sessions/{session.id}")
        deleted_get_response = client.get(f"/imports/sessions/{session.id}")
        deleted_history_response = client.get("/imports/history")
    finally:
        app.dependency_overrides.clear()

    assert history_response.status_code == 200
    assert history_response.json()[0]["session_id"] == session.id
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "ready_to_play"
    assert adapter.tracks == shuffled_playback_order(["101"], session.id)
    assert delete_response.json() == {"session_id": session.id, "deleted": True}
    assert deleted_get_response.status_code == 404
    assert deleted_history_response.json() == []
    assert import_table_counts(tmp_path / "mugame.sqlite3", session.id) == {
        "analytics_jobs": 0,
        "analytics_results": 0,
        "import_orchestrations": 0,
        "orchestration_matched_tracks": 0,
        "source_playlists": 0,
        "source_tracks": 0,
    }


def orchestrator_fixture(
    tmp_path: Path,
    platform: str = "netease",
    analytics_delay_seconds: float = 0,
    analytics_fail: bool = False,
):
    db_path = str(tmp_path / "mugame.sqlite3")
    import_repo = ImportRepository(db_path)
    orchestration_repo = OrchestrationRepository(db_path)
    mapping_repo = TrackMappingRepository(db_path)
    account_repo = AccountSessionRepository(db_path)
    account_repo.save_netease_session(
        {"MUSIC_U": "secret"},
        NeteaseAccountProfile(user_id="42", nickname="Alice"),
    )
    adapter = FakeTempPlaylistAdapter()
    full_import = FullImportService(import_repo, {platform: FakeFullAdapter()})
    temp_playlist = TempPlaylistService(
        import_repository=import_repo,
        mapping_repository=mapping_repo,
        account_repository=account_repo,
        adapter_factory=lambda _record: adapter,
        playlist_name="MusicGame 当前游戏",
        batch_size=200,
        retry_count=0,
    )
    orchestrator = ImportOrchestrator(
        import_repository=import_repo,
        orchestration_repository=orchestration_repo,
        mapping_repository=mapping_repo,
        full_import_service=full_import,
        dedupe_service=TrackDedupeService(),
        matching_service=TrackMatchingService(
            search_adapter=FakeSearchAdapter(),
            mapping_repository=mapping_repo,
            thresholds=MatchThresholds(auto_accept=0.86, need_confirm=0.65),
            concurrency_limit=1,
        ),
        temp_playlist_service=temp_playlist,
        analytics_service=AnalyticsService(
            import_repo,
            orchestration_repo,
            delay_seconds=analytics_delay_seconds,
            fail=analytics_fail,
        ),
    )
    return orchestrator, import_repo, mapping_repo, adapter


def source_playlist(
    playlist_id: str,
    owner_id: str,
    owner_name: str,
    platform: str = "netease",
    track_count: int = 1,
    import_track_limit: int | None = None,
):
    return ConfirmedSourcePlaylist(
        platform=platform,
        canonical_url=f"https://music.163.com/playlist?id={playlist_id}",
        source_playlist_id=playlist_id,
        title=f"{owner_name} 的歌单",
        owner_source_id=owner_id,
        owner_nickname=owner_name,
        track_count=track_count,
        import_track_limit=import_track_limit,
    )


def source_track(track_id: str, owner_name: str):
    return SourceTrackItem(
        id=f"netease:{track_id}",
        platform="netease",
        source_track_id=track_id,
        title=f"歌曲 {track_id}",
        artists=["Artist"],
        source_playlist_id="101",
        owner_source_id=f"owner-{owner_name}",
        owner_nickname=owner_name,
    )


def source_playlist_payload(
    playlist_id: str,
    owner_id: str,
    owner_name: str,
    platform: str = "netease",
):
    return {
        "platform": platform,
        "canonical_url": f"https://music.163.com/playlist?id={playlist_id}",
        "source_playlist_id": playlist_id,
        "title": f"{owner_name} 的歌单",
        "owner_source_id": owner_id,
        "owner_nickname": owner_name,
        "track_count": 1,
    }


def fail_if_called(*_args, **_kwargs):
    raise AssertionError("Restore must reuse stored import and matching results.")


def progress_counts(import_repo: ImportRepository, session_id: str):
    progress = import_repo.get_session(session_id).progress
    return (
        progress.read.current,
        progress.match.current,
        progress.sync.current,
    )


def assert_progress_monotonic(snapshots: list[tuple[int, int, int]]) -> None:
    for previous, current in zip(snapshots, snapshots[1:], strict=False):
        assert current[0] >= previous[0]
        assert current[1] >= previous[1]
        assert current[2] >= previous[2]


def import_table_counts(database_path: Path, session_id: str) -> dict[str, int]:
    tables = [
        "analytics_jobs",
        "analytics_results",
        "import_orchestrations",
        "orchestration_matched_tracks",
        "source_playlists",
        "source_tracks",
    ]
    with sqlite3.connect(database_path) as connection:
        return {
            table: connection.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {session_column(table)} = ?",
                (session_id,),
            ).fetchone()[0]
            for table in tables
        }


def session_column(table: str) -> str:
    if table in {"analytics_jobs", "analytics_results"}:
        return "import_session_id"
    if table == "import_orchestrations":
        return "session_id"
    return "session_id" if table == "orchestration_matched_tracks" else "import_session_id"


def poll_session(import_repo, session_id: str, status: str):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        session = import_repo.get_session(session_id)
        if session.status == status:
            return session
        time.sleep(0.02)
    return import_repo.get_session(session_id)


def poll_analytics(import_repo, session_id: str, status: str):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        session = import_repo.get_session(session_id)
        if session.analytics_status == status:
            return session
        time.sleep(0.02)
    return import_repo.get_session(session_id)


def poll_client_session(client: TestClient, session_id: str, status: str):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        response = client.get(f"/imports/sessions/{session_id}")
        payload = response.json()
        if payload["status"] == status:
            return payload
        time.sleep(0.02)
    return client.get(f"/imports/sessions/{session_id}").json()
