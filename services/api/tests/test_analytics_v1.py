from app.schemas.dedupe import Contributor
from app.repositories.import_repository import ImportRepository
from app.repositories.orchestration_repository import OrchestrationRepository
from app.schemas.imports import ImportSessionResponse, SourcePlaylistImportResult
from app.schemas.matching import MatchedTrackItem, MatchTracksResponse
from app.services.analytics import AnalyticsService
from app.services.analytics_v1 import compute_analytics_v1


def test_analytics_v1_metrics_have_exact_expected_values() -> None:
    metrics = compute_analytics_v1(analytics_session())

    assert metrics["overview"] == {
        "source_playlist_count": 3,
        "participant_count": 2,
        "raw_track_count": 6,
        "unique_track_count": 4,
        "shared_track_count": 1,
        "participants": [
            {
                "owner_source_id": "alice",
                "owner_nickname": "Alice",
                "source_playlist_count": 2,
            },
            {
                "owner_source_id": "bob",
                "owner_nickname": "Bob",
                "source_playlist_count": 1,
            },
        ],
    }
    assert metrics["top_shared_tracks"]["tracks"] == [
        {
            "track_id": "t1",
            "display_title": "Shared Song",
            "artists": ["Artist X"],
            "contributor_count": 2,
            "contributors": [
                {"owner_source_id": "alice", "owner_nickname": "Alice"},
                {"owner_source_id": "bob", "owner_nickname": "Bob"},
            ],
        }
    ]
    assert metrics["pairwise_track_similarity"]["pairs"] == [
        {
            "owner_a": {"owner_source_id": "alice", "owner_nickname": "Alice"},
            "owner_b": {"owner_source_id": "bob", "owner_nickname": "Bob"},
            "intersection": 1,
            "union": 4,
            "jaccard": 0.25,
            "shared_tracks": [
                track_payload("t1", "Shared Song", ["Artist X"], ["alice", "bob"]),
            ],
        }
    ]
    assert metrics["top_artists"]["artists"] == [
        {
            "artist": "Artist X",
            "artist_key": "artist x",
            "unique_track_count": 2,
            "participant_count": 2,
            "tracks": [
                track_payload("t3", "Bob Song", ["Artist X", "Artist Z"], ["bob"]),
                track_payload("t1", "Shared Song", ["Artist X"], ["alice", "bob"]),
            ],
        },
        {
            "artist": "Artist W",
            "artist_key": "artist w",
            "unique_track_count": 1,
            "participant_count": 1,
            "tracks": [
                track_payload("t4", "Alice Song", ["Artist W"], ["alice"]),
            ],
        },
        {
            "artist": "Artist Y",
            "artist_key": "artist y",
            "unique_track_count": 1,
            "participant_count": 1,
            "tracks": [
                track_payload(
                    "t2",
                    "Alice Multi Playlist Song",
                    ["Artist Y"],
                    ["alice"],
                ),
            ],
        },
        {
            "artist": "Artist Z",
            "artist_key": "artist z",
            "unique_track_count": 1,
            "participant_count": 1,
            "tracks": [
                track_payload("t3", "Bob Song", ["Artist X", "Artist Z"], ["bob"]),
            ],
        },
    ]
    assert metrics["pairwise_artist_similarity"]["pairs"] == [
        {
            "owner_a": {"owner_source_id": "alice", "owner_nickname": "Alice"},
            "owner_b": {"owner_source_id": "bob", "owner_nickname": "Bob"},
            "intersection": 1,
            "union": 4,
            "jaccard": 0.25,
            "shared_artists": ["Artist X"],
        }
    ]
    assert metrics["unique_taste_by_owner"]["owners"] == [
        {
            "owner": {"owner_source_id": "alice", "owner_nickname": "Alice"},
            "total_track_count": 3,
            "exclusive_track_count": 2,
            "exclusive_track_ratio": 0.666667,
            "exclusive_tracks": [
                track_payload(
                    "t2",
                    "Alice Multi Playlist Song",
                    ["Artist Y"],
                    ["alice"],
                ),
                track_payload("t4", "Alice Song", ["Artist W"], ["alice"]),
            ],
            "total_artist_count": 3,
            "exclusive_artist_count": 2,
            "exclusive_artist_ratio": 0.666667,
            "exclusive_artists": ["Artist W", "Artist Y"],
        },
        {
            "owner": {"owner_source_id": "bob", "owner_nickname": "Bob"},
            "total_track_count": 2,
            "exclusive_track_count": 1,
            "exclusive_track_ratio": 0.5,
            "exclusive_tracks": [
                track_payload("t3", "Bob Song", ["Artist X", "Artist Z"], ["bob"]),
            ],
            "total_artist_count": 2,
            "exclusive_artist_count": 1,
            "exclusive_artist_ratio": 0.5,
            "exclusive_artists": ["Artist Z"],
        },
    ]
    assert metrics["most_similar_pair"]["pair"] == {
        "owner_a": {"owner_source_id": "alice", "owner_nickname": "Alice"},
        "owner_b": {"owner_source_id": "bob", "owner_nickname": "Bob"},
        "score": 0.25,
        "track_intersection": 1,
        "track_union": 4,
        "track_jaccard": 0.25,
        "artist_intersection": 1,
        "artist_union": 4,
        "artist_jaccard": 0.25,
    }
    assert metrics["most_distinct_pair"] == metrics["most_similar_pair"]


def test_analytics_v1_recomputes_same_payload() -> None:
    first = compute_analytics_v1(analytics_session())
    second = compute_analytics_v1(analytics_session())

    assert second == first


def test_analytics_results_are_persisted_and_read_from_database(tmp_path) -> None:
    db_path = str(tmp_path / "mugame.sqlite3")
    import_repo = ImportRepository(db_path)
    orchestration_repo = OrchestrationRepository(db_path)
    session = analytics_session()
    import_repo.create_session(session.id, session.source_playlists)
    orchestration_repo.create_orchestration(session.id, "ready_to_play")
    orchestration_repo.save_match_result(
        session.id,
        MatchTracksResponse(
            import_session_id=session.id,
            total_track_count=len(session.matched_tracks),
            auto_matched_count=len(session.matched_tracks),
            needs_confirm_count=0,
            no_match_count=0,
            tracks=session.matched_tracks,
        ),
    )
    job_id = orchestration_repo.create_analytics_job(session.id)

    AnalyticsService(import_repo, orchestration_repo).run_job(job_id, session.id)
    restored = ImportRepository(db_path).get_session(session.id)
    restored_metrics = {metric.metric_key: metric.payload for metric in restored.analytics_results}

    assert restored.analytics_status == "completed"
    assert restored_metrics["overview"]["shared_track_count"] == 1
    assert restored_metrics["pairwise_track_similarity"]["pairs"][0]["jaccard"] == 0.25
    assert set(compute_analytics_v1(session)).issubset(restored_metrics)


def test_analytics_service_persists_v1_metric_keys() -> None:
    orchestration_repo = RecordingOrchestrationRepository()
    service = AnalyticsService(FakeImportRepository(), orchestration_repo)

    service.run_job("job-1", "session-1")

    assert orchestration_repo.statuses == ["running", "completed"]
    assert {
        "overview",
        "top_shared_tracks",
        "pairwise_track_similarity",
        "top_artists",
        "pairwise_artist_similarity",
        "unique_taste_by_owner",
        "most_similar_pair",
        "most_distinct_pair",
    }.issubset(orchestration_repo.saved_metrics)


def analytics_session() -> ImportSessionResponse:
    return ImportSessionResponse(
        id="session-1",
        status="ready_to_play",
        raw_track_count=6,
        source_playlists=[
            source_playlist("p1", "alice", "Alice"),
            source_playlist("p2", "alice", "Alice"),
            source_playlist("p3", "bob", "Bob"),
        ],
        tracks=[],
        created_at="2026-08-26T00:00:00Z",
        updated_at="2026-08-26T00:00:00Z",
        matched_tracks=[
            matched_track(
                "t1",
                "Shared Song",
                ["Artist X"],
                [contributor("p1", "alice", "Alice"), contributor("p3", "bob", "Bob")],
            ),
            matched_track(
                "t2",
                "Alice Multi Playlist Song",
                ["Artist Y"],
                [contributor("p1", "alice", "Alice"), contributor("p2", "alice", "Alice")],
            ),
            matched_track(
                "t3",
                "Bob Song",
                ["Artist X", "Artist Z"],
                [contributor("p3", "bob", "Bob")],
            ),
            matched_track(
                "t4",
                "Alice Song",
                ["Artist W"],
                [contributor("p2", "alice", "Alice")],
            ),
        ],
    )


def source_playlist(
    playlist_id: str,
    owner_id: str,
    owner_name: str,
) -> SourcePlaylistImportResult:
    return SourcePlaylistImportResult(
        id=f"{owner_id}:{playlist_id}",
        platform="netease",
        canonical_url=f"https://music.163.com/playlist?id={playlist_id}",
        source_playlist_id=playlist_id,
        title=f"{owner_name} playlist",
        owner_source_id=owner_id,
        owner_nickname=owner_name,
        track_count=1,
        status="ready",
        read_count=1,
    )


def matched_track(
    track_id: str,
    title: str,
    artists: list[str],
    contributors: list[Contributor],
) -> MatchedTrackItem:
    return MatchedTrackItem(
        id=track_id,
        display_title=title,
        artists=artists,
        source_track_ids=[f"source:{track_id}"],
        contributors=contributors,
        match_status="auto_accepted",
        netease_song_id=track_id,
        match_confidence=1,
        match_reason="test",
        candidates=[],
    )


def contributor(playlist_id: str, owner_id: str, owner_name: str) -> Contributor:
    return Contributor(
        platform="netease",
        source_playlist_id=playlist_id,
        owner_source_id=owner_id,
        owner_nickname=owner_name,
    )


def track_payload(
    track_id: str,
    title: str,
    artists: list[str],
    owner_ids: list[str],
) -> dict:
    return {
        "track_id": track_id,
        "display_title": title,
        "artists": artists,
        "contributor_count": len(owner_ids),
        "contributors": [owner_payload(owner_id) for owner_id in owner_ids],
    }


def owner_payload(owner_id: str) -> dict[str, str]:
    names = {"alice": "Alice", "bob": "Bob"}
    return {"owner_source_id": owner_id, "owner_nickname": names[owner_id]}


class FakeImportRepository:
    def get_session(self, _session_id: str) -> ImportSessionResponse:
        return analytics_session()


class RecordingOrchestrationRepository:
    def __init__(self) -> None:
        self.statuses: list[str] = []
        self.saved_metrics: dict[str, dict] = {}

    def mark_analytics_status(
        self,
        _job_id: str,
        status: str,
        _error_message: str | None = None,
    ) -> None:
        self.statuses.append(status)

    def save_analytics_result(
        self,
        _job_id: str,
        _session_id: str,
        metric_key: str,
        payload: dict,
    ) -> None:
        self.saved_metrics[metric_key] = payload
