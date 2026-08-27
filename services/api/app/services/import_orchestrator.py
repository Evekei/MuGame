from threading import Thread

from app.core.errors import AppError
from app.integrations.netease.track_search import NeteaseSearchRateLimited
from app.repositories.import_repository import ImportRepository
from app.repositories.orchestration_repository import OrchestrationRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.imports import FullImportRequest, ImportSessionResponse
from app.schemas.temp_playlist import TempPlaylistSyncResponse
from app.services.analytics import AnalyticsService
from app.services.full_import import FullImportService
from app.services.temp_playlist import TempPlaylistService, playable_netease_plan
from app.services.track_dedupe import TrackDedupeService
from app.services.track_matching import TrackMatchingService


STAGE_ORDER = {
    "importing": 1,
    "normalizing": 2,
    "matching": 3,
    "syncing_temp": 4,
}


class ImportOrchestrator:
    def __init__(
        self,
        import_repository: ImportRepository,
        orchestration_repository: OrchestrationRepository,
        mapping_repository: TrackMappingRepository,
        full_import_service: FullImportService,
        dedupe_service: TrackDedupeService,
        matching_service: TrackMatchingService,
        temp_playlist_service: TempPlaylistService,
        analytics_service: AnalyticsService,
    ):
        self.import_repository = import_repository
        self.orchestration_repository = orchestration_repository
        self.mapping_repository = mapping_repository
        self.full_import_service = full_import_service
        self.dedupe_service = dedupe_service
        self.matching_service = matching_service
        self.temp_playlist_service = temp_playlist_service
        self.analytics_service = analytics_service

    def start(self, request: FullImportRequest) -> ImportSessionResponse:
        session = self.full_import_service.create_session(request)
        self.orchestration_repository.create_orchestration(session.id, "importing")
        self._run_async(session.id, "importing")
        return self.import_repository.get_session(session.id)

    def retry(self, session_id: str) -> ImportSessionResponse:
        if not self.orchestration_repository.has_orchestration(session_id):
            return self.full_import_service.retry_failed(session_id)
        failed_stage = self.orchestration_repository.get_failed_stage(session_id)
        self._run_async(session_id, failed_stage or "importing")
        return self.import_repository.get_session(session_id)

    def retry_analytics(self, session_id: str) -> ImportSessionResponse:
        self.import_repository.get_session(session_id)
        if not self.orchestration_repository.has_orchestration(session_id):
            raise KeyError(session_id)
        job_id = self.orchestration_repository.create_analytics_job(session_id)
        self.analytics_service.start_async(job_id, session_id)
        return self.import_repository.get_session(session_id)

    def restore_temp_playlist(self, session_id: str) -> ImportSessionResponse:
        session = self.import_repository.get_session(session_id)
        if (
            session.status != "ready_to_play"
            or not self.orchestration_repository.has_orchestration(session_id)
        ):
            raise AppError(
                "IMPORT_HISTORY_NOT_READY",
                "Only ready import history can be restored.",
                409,
            )
        deduped = self.dedupe_service.dedupe_session(session)
        target_ids, _skipped = playable_netease_plan(deduped.tracks, self.mapping_repository)
        response = self.temp_playlist_service.sync(session_id)
        if response.status != "ready":
            raise AppError(
                response.error or "NETEASE_SYNC_FAILED",
                "Temporary playlist restore failed.",
                502,
            )
        self.orchestration_repository.mark_ready(
            session_id,
            response.temp_playlist_id,
            response.synced_count,
            len(target_ids),
        )
        return self.import_repository.get_session(session_id)

    def run(self, session_id: str, start_stage: str = "importing") -> None:
        try:
            self._run(session_id, start_stage)
        except AppError as error:
            self._fail(session_id, start_stage, error.code, error.message)
        except Exception as error:
            self._fail(
                session_id,
                start_stage,
                "IMPORT_ORCHESTRATION_FAILED",
                str(error) or error.__class__.__name__,
            )

    def _run(self, session_id: str, start_stage: str) -> None:
        if should_run(start_stage, "importing"):
            self.orchestration_repository.mark_status(session_id, "importing")
            sources = self.import_repository.list_sources(session_id)
            if any(source.status == "pending" for source in sources):
                self.full_import_service.run_import(session_id)
            else:
                self.full_import_service.retry_failed(session_id)
            session = self.import_repository.get_session(session_id)
            if session.status == "failed" and not session.tracks:
                self._fail(
                    session_id,
                    "importing",
                    "IMPORTING_FAILED",
                    "No source playlist was imported.",
                )
                return

        if should_run(start_stage, "normalizing"):
            self.orchestration_repository.mark_status(session_id, "normalizing")
        session = self.import_repository.get_session(session_id)
        deduped = self.dedupe_service.dedupe_session(session)

        if should_run(start_stage, "matching"):
            self.orchestration_repository.mark_matching(session_id, len(deduped.tracks))
            try:
                result = self.matching_service.match_tracks(
                    session_id,
                    deduped.tracks,
                    on_progress=lambda _item: self.orchestration_repository.increment_matched(
                        session_id
                    ),
                )
            except NeteaseSearchRateLimited:
                self._fail(
                    session_id,
                    "matching",
                    "NETEASE_RATE_LIMITED",
                    "网易云搜索操作频繁，请稍后重试。",
                )
                return
            self.orchestration_repository.save_match_result(session_id, result)

        self._sync_temp_playlist(session_id, deduped.tracks)

    def _sync_temp_playlist(self, session_id: str, tracks) -> None:
        target_ids, _skipped = playable_netease_plan(tracks, self.mapping_repository)
        self.orchestration_repository.mark_syncing(session_id, len(target_ids))
        try:
            response = self.temp_playlist_service.sync(session_id)
        except AppError as error:
            self._fail(session_id, "syncing_temp", error.code, error.message)
            return
        if response.status != "ready":
            self._fail(
                session_id,
                "syncing_temp",
                response.error or "NETEASE_SYNC_FAILED",
                "Temporary playlist sync failed.",
            )
            return
        self._ready(session_id, response, len(target_ids))

    def _ready(
        self,
        session_id: str,
        response: TempPlaylistSyncResponse,
        sync_total: int,
    ) -> None:
        job_id = self.orchestration_repository.create_analytics_job(session_id)
        self.orchestration_repository.mark_ready(
            session_id,
            response.temp_playlist_id,
            response.synced_count,
            sync_total,
        )
        self.analytics_service.start_async(job_id, session_id)

    def _run_async(self, session_id: str, start_stage: str) -> None:
        thread = Thread(
            target=self.run,
            args=(session_id, start_stage),
            daemon=True,
        )
        thread.start()

    def _fail(self, session_id: str, stage: str, code: str, message: str) -> None:
        self.orchestration_repository.mark_failed(session_id, stage, code, message)


def should_run(start_stage: str, current_stage: str) -> bool:
    return STAGE_ORDER[current_stage] >= STAGE_ORDER.get(start_stage, 1)
