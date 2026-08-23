from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import BoundedSemaphore

from app.domain.track_matching import MatchThresholds, classify_score, score_candidate
from app.integrations.netease.track_search import NeteaseSearchRateLimited
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.dedupe import UnifiedTrackItem
from app.schemas.matching import (
    ManualMatchConfirmRequest,
    MatchTracksResponse,
    MatchedTrackItem,
    NeteaseTrackCandidate,
)


class TrackMatchingService:
    def __init__(
        self,
        search_adapter,
        mapping_repository: TrackMappingRepository,
        thresholds: MatchThresholds,
        concurrency_limit: int,
    ):
        self.search_adapter = search_adapter
        self.mapping_repository = mapping_repository
        self.thresholds = thresholds
        self.semaphore = BoundedSemaphore(max(1, concurrency_limit))
        self.concurrency_limit = max(1, concurrency_limit)

    def match_tracks(
        self,
        import_session_id: str,
        tracks: list[UnifiedTrackItem],
        on_progress=None,
    ) -> MatchTracksResponse:
        matched = [None] * len(tracks)
        with ThreadPoolExecutor(max_workers=self.concurrency_limit) as executor:
            for batch_start in range(0, len(tracks), self.concurrency_limit):
                futures = {
                    executor.submit(self._match_track, track): index
                    for index, track in enumerate(
                        tracks[batch_start : batch_start + self.concurrency_limit],
                        start=batch_start,
                    )
                }
                rate_limit_error = None
                for future in as_completed(futures):
                    try:
                        item = future.result()
                    except NeteaseSearchRateLimited as error:
                        rate_limit_error = error
                        continue

                    matched[futures[future]] = item
                    if on_progress:
                        on_progress(item)
                if rate_limit_error:
                    raise rate_limit_error

        items = [item for item in matched if item is not None]
        return MatchTracksResponse(
            import_session_id=import_session_id,
            total_track_count=len(items),
            auto_matched_count=count_status(items, "auto_accepted"),
            needs_confirm_count=count_status(items, "needs_confirm"),
            no_match_count=count_status(items, "no_match"),
            tracks=items,
        )

    def confirm_manual_match(
        self,
        track: UnifiedTrackItem,
        request: ManualMatchConfirmRequest,
    ) -> MatchedTrackItem:
        candidate = NeteaseTrackCandidate(
            netease_song_id=request.netease_song_id,
            title=request.title,
            artists=request.artists,
            album=request.album,
            duration_ms=request.duration_ms,
            score=1,
            reason="manual_confirmed",
        )
        self._save_cache_for_source_ids(
            request.source_track_ids,
            candidate,
            "manual_confirmed",
            1,
        )
        return matched_item(track, "manual_confirmed", candidate, "manual_confirmed", [])

    def _match_track(self, track: UnifiedTrackItem) -> MatchedTrackItem:
        native_id = native_netease_song_id(track)
        if native_id:
            candidate = native_candidate(track, native_id)
            return matched_item(track, "auto_accepted", candidate, "native_netease_song_id", [])

        cached = first_cached_mapping(track, self.mapping_repository)
        if cached:
            return matched_item(
                track,
                "auto_accepted",
                cached.candidate,
                "mapping_cache_hit",
                [],
            )

        candidates = self._search_candidates(track)
        if not candidates:
            return unmatched_item(track, "no_search_candidates")

        best = candidates[0]
        status = classify_score(best.score, self.thresholds)
        if status == "auto_accepted":
            self._save_cache_for_source_ids(
                track.source_track_ids,
                best,
                "auto_accepted",
                best.score,
            )
            return matched_item(track, status, best, best.reason, candidates)
        if status == "needs_confirm":
            return matched_item(track, status, best, best.reason, candidates[:5])
        return unmatched_item(track, best.reason, candidates[:5])

    def _search_candidates(self, track: UnifiedTrackItem) -> list[NeteaseTrackCandidate]:
        with self.semaphore:
            candidates = self.search_adapter.search_track(track, limit=5)
        scored = [score_candidate(track, candidate) for candidate in candidates]
        return sorted(scored, key=lambda candidate: candidate.score, reverse=True)

    def _save_cache_for_source_ids(
        self,
        source_track_ids: list[str],
        candidate: NeteaseTrackCandidate,
        match_status: str,
        confidence: float,
    ) -> None:
        for source_key in source_track_ids:
            platform, source_track_id = split_source_key(source_key)
            if platform == "netease":
                continue
            self.mapping_repository.save_mapping(
                platform,
                source_track_id,
                candidate,
                match_status,
                confidence,
            )


def matched_item(
    track: UnifiedTrackItem,
    status: str,
    candidate: NeteaseTrackCandidate,
    reason: str,
    candidates: list[NeteaseTrackCandidate],
) -> MatchedTrackItem:
    return MatchedTrackItem(
        id=track.id,
        display_title=track.display_title,
        artists=track.artists,
        album=track.album,
        duration_ms=track.duration_ms,
        source_track_ids=list(track.source_track_ids),
        contributors=list(track.contributors),
        match_status=status,
        netease_song_id=candidate.netease_song_id,
        match_confidence=candidate.score,
        match_reason=reason,
        candidates=candidates,
    )


def unmatched_item(
    track: UnifiedTrackItem,
    reason: str,
    candidates: list[NeteaseTrackCandidate] | None = None,
) -> MatchedTrackItem:
    return MatchedTrackItem(
        id=track.id,
        display_title=track.display_title,
        artists=track.artists,
        album=track.album,
        duration_ms=track.duration_ms,
        source_track_ids=list(track.source_track_ids),
        contributors=list(track.contributors),
        match_status="no_match",
        match_reason=reason,
        candidates=candidates or [],
    )


def native_netease_song_id(track: UnifiedTrackItem) -> str | None:
    for source_key in track.source_track_ids:
        platform, source_track_id = split_source_key(source_key)
        if platform == "netease" and source_track_id:
            return source_track_id
    return None


def native_candidate(track: UnifiedTrackItem, song_id: str) -> NeteaseTrackCandidate:
    return NeteaseTrackCandidate(
        netease_song_id=song_id,
        title=track.display_title,
        artists=track.artists,
        album=track.album,
        duration_ms=track.duration_ms,
        score=1,
        reason="native_netease_song_id",
    )


def first_cached_mapping(track: UnifiedTrackItem, repository: TrackMappingRepository):
    for source_key in track.source_track_ids:
        platform, source_track_id = split_source_key(source_key)
        if platform == "netease":
            continue
        cached = repository.get_mapping(platform, source_track_id)
        if cached:
            return cached
    return None


def split_source_key(source_key: str) -> tuple[str, str]:
    platform, _, source_track_id = source_key.partition(":")
    return platform, source_track_id


def count_status(items: list[MatchedTrackItem], status: str) -> int:
    return sum(1 for item in items if item.match_status == status)
