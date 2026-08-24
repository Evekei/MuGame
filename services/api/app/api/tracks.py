from fastapi import APIRouter, Depends

from app.api.imports import get_netease_session_cookies
from app.core.config import Settings, get_settings
from app.integrations.netease.lyrics import NeteaseLyricsClient
from app.schemas.lyrics import LyricsResponse
from app.services.lyrics import LyricsService

router = APIRouter(prefix="/tracks", tags=["tracks"])


def get_lyrics_service(
    settings: Settings = Depends(get_settings),
    netease_cookies: dict[str, str] = Depends(get_netease_session_cookies),
) -> LyricsService:
    return LyricsService(
        NeteaseLyricsClient(
            settings.netease_request_timeout_seconds,
            netease_cookies,
        )
    )


@router.get("/{track_id}/lyrics", response_model=LyricsResponse)
def get_track_lyrics(
    track_id: str,
    service: LyricsService = Depends(get_lyrics_service),
) -> LyricsResponse:
    return service.get_lyrics(track_id)
