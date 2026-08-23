from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.integrations.playlist_full import (
    FullPlaylistAdapter,
    default_full_playlist_adapters,
)
from app.integrations.netease.track_search import NeteaseTrackSearchAdapter
from app.integrations.playlist_preview import (
    PlaylistPreviewAdapter,
    default_playlist_preview_adapters,
)
from app.repositories.account_session_repository import AccountSessionRepository
from app.repositories.import_repository import ImportRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.domain.track_matching import MatchThresholds
from app.schemas.imports import (
    FullImportRequest,
    ImportPreviewRequest,
    ImportPreviewResponse,
    ImportSessionResponse,
)
from app.services.full_import import FullImportService
from app.services.import_preview import ImportPreviewService
from app.services.match_job import MatchJobService
from app.services.track_dedupe import TrackDedupeService
from app.services.track_matching import TrackMatchingService

router = APIRouter(prefix="/imports", tags=["imports"])
match_job_service = MatchJobService()


def get_netease_session_cookies(
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    record = AccountSessionRepository(settings.database_path).get_netease_session()
    return record.cookies if record else {}


def get_playlist_preview_adapters(
    settings: Settings = Depends(get_settings),
    netease_cookies: dict[str, str] = Depends(get_netease_session_cookies),
) -> dict[str, PlaylistPreviewAdapter]:
    return default_playlist_preview_adapters(
        settings.playlist_preview_timeout_seconds,
        netease_cookies,
    )


def get_import_preview_service(
    adapters: dict[str, PlaylistPreviewAdapter] = Depends(
        get_playlist_preview_adapters
    ),
) -> ImportPreviewService:
    return ImportPreviewService(adapters)


def get_full_playlist_adapters(
    settings: Settings = Depends(get_settings),
    netease_cookies: dict[str, str] = Depends(get_netease_session_cookies),
) -> dict[str, FullPlaylistAdapter]:
    return default_full_playlist_adapters(
        settings.playlist_preview_timeout_seconds,
        netease_cookies,
    )


def get_import_repository(
    settings: Settings = Depends(get_settings),
) -> ImportRepository:
    return ImportRepository(settings.database_path)


def get_track_mapping_repository(
    settings: Settings = Depends(get_settings),
) -> TrackMappingRepository:
    return TrackMappingRepository(settings.database_path)


def get_full_import_service(
    repository: ImportRepository = Depends(get_import_repository),
    adapters: dict[str, FullPlaylistAdapter] = Depends(get_full_playlist_adapters),
) -> FullImportService:
    return FullImportService(repository, adapters)


def get_track_dedupe_service() -> TrackDedupeService:
    return TrackDedupeService()


def get_track_matching_service(
    settings: Settings = Depends(get_settings),
    netease_cookies: dict[str, str] = Depends(get_netease_session_cookies),
    repository: TrackMappingRepository = Depends(get_track_mapping_repository),
) -> TrackMatchingService:
    return TrackMatchingService(
        search_adapter=NeteaseTrackSearchAdapter(
            settings.netease_request_timeout_seconds,
            netease_cookies,
        ),
        mapping_repository=repository,
        thresholds=MatchThresholds(
            auto_accept=settings.match_auto_accept_score,
            need_confirm=settings.match_need_confirm_score,
        ),
        concurrency_limit=settings.match_concurrency_limit,
    )


def get_match_job_service() -> MatchJobService:
    return match_job_service


@router.post("/preview", response_model=ImportPreviewResponse)
def preview_imports(
    request: ImportPreviewRequest,
    service: ImportPreviewService = Depends(get_import_preview_service),
) -> ImportPreviewResponse:
    return service.preview(request.raw_share_texts)


@router.post("/full", response_model=ImportSessionResponse)
def start_full_import(
    request: FullImportRequest,
    background_tasks: BackgroundTasks,
    service: FullImportService = Depends(get_full_import_service),
) -> ImportSessionResponse:
    session = service.create_session(request)
    background_tasks.add_task(service.run_import, session.id)
    return service.get_session(session.id)


@router.get("/sessions/{session_id}", response_model=ImportSessionResponse)
def get_import_session(
    session_id: str,
    service: FullImportService = Depends(get_full_import_service),
) -> ImportSessionResponse:
    try:
        return service.get_session(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error


@router.post("/sessions/{session_id}/retry", response_model=ImportSessionResponse)
def retry_failed_import_sources(
    session_id: str,
    service: FullImportService = Depends(get_full_import_service),
) -> ImportSessionResponse:
    try:
        return service.retry_failed(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error

