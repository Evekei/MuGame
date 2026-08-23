from threading import Lock
from time import sleep

import pytest

from app.domain.track_matching import MatchThresholds, score_candidate
from app.integrations.netease.track_search import NeteaseSearchRateLimited
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.dedupe import Contributor, UnifiedTrackItem
from app.schemas.matching import ManualMatchConfirmRequest, NeteaseTrackCandidate
from app.services.track_matching import TrackMatchingService


class FakeSearchAdapter:
    def __init__(self, candidates):
        self.candidates = candidates
        self.calls = 0

    def search_track(self, _track, limit=5):
        self.calls += 1
        return self.candidates[:limit]


class TrackingSearchAdapter:
    def __init__(self, candidate):
        self.candidate = candidate
        self.active = 0
        self.max_active = 0
        self.lock = Lock()

    def search_track(self, _track, limit=5):
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        sleep(0.02)
        with self.lock:
            self.active -= 1
        return [self.candidate]


class RateLimitedSearchAdapter:
    def __init__(self):
        self.calls = 0

    def search_track(self, _track, limit=5):
        self.calls += 1
        raise NeteaseSearchRateLimited("rate limited")


def test_match_scoring_considers_title_artist_duration_album_version() -> None:
    scored = score_candidate(
        unified_track("qq:1", title="Song", artists=["Alice"], album="Album"),
        candidate("100", title="Song", artists=["Alice"], album="Album"),
    )
    live = score_candidate(
        unified_track("qq:1", title="Song", artists=["Alice"], album="Album"),
        candidate("101", title="Song Live", artists=["Alice"], album="Album Live"),
    )

    assert scored.score > 0.9
    assert live.score < scored.score
    assert "version=" in scored.reason


def test_cache_hit_skips_search(tmp_path) -> None:
    repository = TrackMappingRepository(str(tmp_path / "cache.sqlite3"))
    repository.save_mapping("qq", "cached", candidate("123"), "auto_accepted", 0.95)
    adapter = FakeSearchAdapter([candidate("999")])
    service = matching_service(repository, adapter)

    response = service.match_tracks("session", [unified_track("qq:cached")])

    assert adapter.calls == 0
    assert response.tracks[0].netease_song_id == "123"
    assert response.tracks[0].contributors == unified_track("qq:cached").contributors


def test_search_is_limited_by_semaphore(tmp_path) -> None:
    adapter = TrackingSearchAdapter(candidate("123"))
    service = matching_service(
        TrackMappingRepository(str(tmp_path / "cache.sqlite3")),
        adapter,
        concurrency_limit=2,
    )
    tracks = [unified_track(f"qq:{index}") for index in range(6)]

    service.match_tracks("session", tracks)

    assert adapter.max_active <= 2


def test_rate_limit_stops_after_current_batch(tmp_path) -> None:
    adapter = RateLimitedSearchAdapter()
    service = matching_service(
        TrackMappingRepository(str(tmp_path / "cache.sqlite3")),
        adapter,
        concurrency_limit=3,
    )
    tracks = [unified_track(f"qq:{index}") for index in range(9)]

    with pytest.raises(NeteaseSearchRateLimited):
        service.match_tracks("session", tracks)

    assert adapter.calls <= 3


def test_manual_confirm_writes_cache_and_keeps_contributors(tmp_path) -> None:
    repository = TrackMappingRepository(str(tmp_path / "cache.sqlite3"))
    service = matching_service(repository, FakeSearchAdapter([]))
    track = unified_track("qq:manual")

    matched = service.confirm_manual_match(
        track,
        ManualMatchConfirmRequest(
            source_track_ids=["qq:manual"],
            netease_song_id="321",
            title="Song",
            artists=["Alice"],
        ),
    )

    cached = repository.get_mapping("qq", "manual")
    assert matched.match_status == "manual_confirmed"
    assert matched.contributors == track.contributors
    assert cached is not None
    assert cached.candidate.netease_song_id == "321"


def test_no_match_does_not_block_other_tracks(tmp_path) -> None:
    service = matching_service(
        TrackMappingRepository(str(tmp_path / "cache.sqlite3")),
        FakeSearchAdapter([candidate("bad", title="Other", artists=["Other"])]),
    )

    response = service.match_tracks(
        "session",
        [unified_track("netease:1"), unified_track("qq:no-match")],
    )

    assert response.auto_matched_count == 1
    assert response.no_match_count == 1
    assert response.total_track_count == 2


def matching_service(repository, adapter, concurrency_limit=3):
    return TrackMatchingService(
        search_adapter=adapter,
        mapping_repository=repository,
        thresholds=MatchThresholds(auto_accept=0.86, need_confirm=0.65),
        concurrency_limit=concurrency_limit,
    )


def unified_track(
    source_key: str,
    title: str = "Song",
    artists: list[str] | None = None,
    album: str | None = "Album",
) -> UnifiedTrackItem:
    return UnifiedTrackItem(
        id=source_key,
        normalized_title=title.lower(),
        display_title=title,
        artists=artists or ["Alice"],
        normalized_artists=[(artists or ["Alice"])[0].lower()],
        album=album,
        normalized_album=album.lower() if album else None,
        duration_ms=180000,
        source_track_ids=[source_key],
        contributors=[
            Contributor(
                platform=source_key.split(":", 1)[0],
                source_playlist_id="playlist",
                owner_source_id="owner",
                owner_nickname="Alice",
            )
        ],
        explain_dedup_reason="test",
    )


def candidate(
    song_id: str,
    title: str = "Song",
    artists: list[str] | None = None,
    album: str | None = "Album",
) -> NeteaseTrackCandidate:
    return NeteaseTrackCandidate(
        netease_song_id=song_id,
        title=title,
        artists=artists or ["Alice"],
        album=album,
        duration_ms=180000,
    )
