from threading import Thread
import time

from app.repositories.import_repository import ImportRepository
from app.repositories.orchestration_repository import OrchestrationRepository
from app.services.analytics_v1 import compute_analytics_v1
from app.services.analytics_v2 import compute_analytics_v2


class AnalyticsService:
    def __init__(
        self,
        import_repository: ImportRepository,
        orchestration_repository: OrchestrationRepository,
        delay_seconds: float = 0,
        fail: bool = False,
    ):
        self.import_repository = import_repository
        self.orchestration_repository = orchestration_repository
        self.delay_seconds = delay_seconds
        self.fail = fail

    def start_async(self, job_id: str, session_id: str) -> None:
        thread = Thread(
            target=self.run_job,
            args=(job_id, session_id),
            daemon=True,
        )
        thread.start()

    def run_job(self, job_id: str, session_id: str) -> None:
        self.orchestration_repository.mark_analytics_status(job_id, "running")
        try:
            if self.delay_seconds > 0:
                time.sleep(self.delay_seconds)
            if self.fail:
                raise RuntimeError("analytics failed")
            metrics = self._compute_metrics(session_id)
            for metric_key, payload in metrics.items():
                self.orchestration_repository.save_analytics_result(
                    job_id,
                    session_id,
                    metric_key,
                    payload,
                )
            self.orchestration_repository.mark_analytics_status(job_id, "completed")
        except Exception as error:
            self.orchestration_repository.mark_analytics_status(
                job_id,
                "failed",
                str(error) or error.__class__.__name__,
            )

    def _compute_metrics(self, session_id: str) -> dict[str, dict]:
        session = self.import_repository.get_session(session_id)
        return {
            **compute_analytics_v1(session),
            **compute_analytics_v2(session),
        }
