from fastapi import APIRouter, Depends, HTTPException

from app.api.account import get_account_session_repository
from app.api.imports import get_import_repository, get_track_mapping_repository
from app.core.config import Settings, get_settings
from app.integrations.netease.temp_playlist import NeteaseTempPlaylistAdapter
from app.repositories.account_session_repository import AccountSessionRepository
from app.repositories.import_repository import ImportRepository
from app.repositories.track_mapping_repository import TrackMappingRepository
from app.schemas.temp_playlist import (
    KnownTempPlaylistSyncRequest,
    TempPlaylistSyncResponse,
)
from app.services.temp_playlist import TempPlaylistService

router = APIRouter(prefix="/imports", tags=["temp-playlist"])


def get_temp_playlist_service(
    settings: Settings = Depends(get_settings),
    import_repository: ImportRepository = Depends(get_import_repository),
    mapping_repository: TrackMappingRepository = Depends(get_track_mapping_repository),
    account_repository: AccountSessionRepository = Depends(get_account_session_repository),
) -> TempPlaylistService:
    return TempPlaylistService(
        import_repository=import_repository,
        mapping_repository=mapping_repository,
        account_repository=account_repository,
        adapter_factory=lambda record: NeteaseTempPlaylistAdapter(
            settings.netease_request_timeout_seconds,
            record.cookies,
            record.profile.user_id,
        ),
        playlist_name=settings.temp_playlist_name,
        batch_size=settings.temp_playlist_batch_size,
        retry_count=settings.temp_playlist_batch_retry_count,
    )


@router.post(
    "/sessions/{session_id}/temp-playlist/sync",
    response_model=TempPlaylistSyncResponse,
)
def sync_import_session_temp_playlist(
    session_id: str,
    service: TempPlaylistService = Depends(get_temp_playlist_service),
) -> TempPlaylistSyncResponse:
    try:
        return service.sync(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error


@router.post(
    "/temp-playlist/sync-known",
    response_model=TempPlaylistSyncResponse,
)
def sync_known_temp_playlist(
    request: KnownTempPlaylistSyncRequest,
    service: TempPlaylistService = Depends(get_temp_playlist_service),
) -> TempPlaylistSyncResponse:
    return service.sync_known_netease_song_ids(
        request.import_session_id,
        request.netease_song_ids,
    )
