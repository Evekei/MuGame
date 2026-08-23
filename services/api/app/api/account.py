from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.integrations.netease.account_client import NeteaseAccountClient
from app.repositories.account_session_repository import AccountSessionRepository
from app.schemas.account import (
    NeteaseAccountSessionResponse,
    NeteaseSessionSnapshot,
)
from app.services.netease_account import NeteaseAccountService

router = APIRouter(prefix="/account/netease", tags=["netease-account"])


def get_account_session_repository(
    settings: Settings = Depends(get_settings),
) -> AccountSessionRepository:
    return AccountSessionRepository(settings.database_path)


def get_netease_account_client(
    settings: Settings = Depends(get_settings),
) -> NeteaseAccountClient:
    return NeteaseAccountClient(
        profile_url=settings.netease_profile_url,
        timeout_seconds=settings.netease_request_timeout_seconds,
    )


def get_netease_account_service(
    repository: AccountSessionRepository = Depends(get_account_session_repository),
    account_client: NeteaseAccountClient = Depends(get_netease_account_client),
) -> NeteaseAccountService:
    return NeteaseAccountService(repository, account_client)


@router.get("/session", response_model=NeteaseAccountSessionResponse)
def read_netease_session(
    service: NeteaseAccountService = Depends(get_netease_account_service),
) -> NeteaseAccountSessionResponse:
    return service.read_session()


@router.post("/session", response_model=NeteaseAccountSessionResponse)
def save_netease_session(
    snapshot: NeteaseSessionSnapshot,
    service: NeteaseAccountService = Depends(get_netease_account_service),
) -> NeteaseAccountSessionResponse:
    return service.save_session(snapshot)


@router.delete("/session", response_model=NeteaseAccountSessionResponse)
def clear_netease_session(
    service: NeteaseAccountService = Depends(get_netease_account_service),
) -> NeteaseAccountSessionResponse:
    return service.clear_session()
