from dataclasses import dataclass
from threading import Lock
from uuid import uuid4

from app.schemas.dedupe import UnifiedTrackItem
from app.schemas.matching import MatchedTrackItem, MatchJobResponse, MatchTracksResponse
from app.integrations.netease.track_search import NeteaseSearchRateLimited
from app.services.track_matching import TrackMatchingService


@dataclass
class MatchJobRecord:
    id: str
    import_session_id: str
    status: str
    processed_track_count: int
    total_track_count: int
    auto_matched_count: int = 0
    needs_confirm_count: int = 0
    no_match_count: int = 0
    current_title: str | None = None
    error: str | None = None
    result: MatchTracksResponse | None = None


class MatchJobService:
    def __init__(self):
        self._jobs: dict[str, MatchJobRecord] = {}
        self._lock = Lock()

    def create_job(self, import_session_id: str, total_track_count: int) -> MatchJobResponse:
        job = MatchJobRecord(
            id=str(uuid4()),
            import_session_id=import_session_id,
            status="pending",
            processed_track_count=0,
            total_track_count=total_track_count,
        )
        with self._lock:
            self._jobs[job.id] = job
        return job_response(job)

    def get_job(self, job_id: str) -> MatchJobResponse:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            return job_response(job)

    def run_job(
        self,
        job_id: str,
        import_session_id: str,
        tracks: list[UnifiedTrackItem],
        matching_service: TrackMatchingService,
    ) -> None:
        self._mark_running(job_id)
        try:
            result = matching_service.match_tracks(
                import_session_id,
                tracks,
                on_progress=lambda item: self._record_progress(job_id, item),
            )
            self._mark_ready(job_id, result)
        except NeteaseSearchRateLimited:
            self._mark_rate_limited(job_id)
        except Exception as error:
            self._mark_failed(job_id, str(error) or error.__class__.__name__)

    def _mark_running(self, job_id: str) -> None:
        with self._lock:
            self._jobs[job_id].status = "running"

    def _record_progress(self, job_id: str, item: MatchedTrackItem) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.processed_track_count += 1
            job.current_title = item.display_title
            if item.match_status == "auto_accepted":
                job.auto_matched_count += 1
            elif item.match_status == "needs_confirm":
                job.needs_confirm_count += 1
            elif item.match_status == "no_match":
                job.no_match_count += 1

    def _mark_ready(self, job_id: str, result: MatchTracksResponse) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "ready"
            job.result = result
            job.processed_track_count = result.total_track_count
            job.auto_matched_count = result.auto_matched_count
            job.needs_confirm_count = result.needs_confirm_count
            job.no_match_count = result.no_match_count
            job.current_title = None

    def _mark_failed(self, job_id: str, message: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "failed"
            job.error = message
            job.current_title = None

    def _mark_rate_limited(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "rate_limited"
            job.error = "网易云搜索操作频繁，请稍后重试。"
            job.current_title = None


def job_response(job: MatchJobRecord) -> MatchJobResponse:
    return MatchJobResponse(
        id=job.id,
        import_session_id=job.import_session_id,
        status=job.status,
        processed_track_count=job.processed_track_count,
        total_track_count=job.total_track_count,
        auto_matched_count=job.auto_matched_count,
        needs_confirm_count=job.needs_confirm_count,
        no_match_count=job.no_match_count,
        current_title=job.current_title,
        error=job.error,
        result=job.result,
    )
