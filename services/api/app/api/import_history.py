from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.imports import get_import_orchestrator, get_import_repository
from app.repositories.import_repository import ImportRepository
from app.schemas.imports import (
    ImportHistoryItem,
    ImportSessionDeleteResponse,
    ImportSessionResponse,
)
from app.services.import_orchestrator import ImportOrchestrator

router = APIRouter(prefix="/imports", tags=["import-history"])


@router.get("/history", response_model=list[ImportHistoryItem])
def list_import_history(
    limit: int = Query(default=20, ge=1, le=100),
    repository: ImportRepository = Depends(get_import_repository),
) -> list[ImportHistoryItem]:
    return repository.list_history(limit)


@router.post(
    "/sessions/{session_id}/restore-temp-playlist",
    response_model=ImportSessionResponse,
)
def restore_import_history_temp_playlist(
    session_id: str,
    orchestrator: ImportOrchestrator = Depends(get_import_orchestrator),
) -> ImportSessionResponse:
    try:
        return orchestrator.restore_temp_playlist(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error


@router.delete(
    "/sessions/{session_id}",
    response_model=ImportSessionDeleteResponse,
)
def delete_import_session(
    session_id: str,
    repository: ImportRepository = Depends(get_import_repository),
) -> ImportSessionDeleteResponse:
    if not repository.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Import session not found.")
    return ImportSessionDeleteResponse(session_id=session_id, deleted=True)
