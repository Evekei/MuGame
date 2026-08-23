from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.api.imports import (
    get_full_import_service,
    get_match_job_service,
    get_track_dedupe_service,
    get_track_matching_service,
)
from app.schemas.dedupe import DedupeTracksResponse
from app.schemas.matching import (
    ManualMatchConfirmRequest,
    MatchedTrackItem,
    MatchJobResponse,
    MatchTracksResponse,
)
from app.services.full_import import FullImportService
from app.services.match_job import MatchJobService
from app.services.track_dedupe import TrackDedupeService
from app.services.track_matching import TrackMatchingService

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/sessions/{session_id}/dedupe", response_model=DedupeTracksResponse)
def dedupe_import_session_tracks(
    session_id: str,
    import_service: FullImportService = Depends(get_full_import_service),
    dedupe_service: TrackDedupeService = Depends(get_track_dedupe_service),
) -> DedupeTracksResponse:
    try:
        session = import_service.get_session(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error
    return dedupe_service.dedupe_session(session)


@router.post("/sessions/{session_id}/match", response_model=MatchTracksResponse)
def match_import_session_tracks(
    session_id: str,
    import_service: FullImportService = Depends(get_full_import_service),
    dedupe_service: TrackDedupeService = Depends(get_track_dedupe_service),
    matching_service: TrackMatchingService = Depends(get_track_matching_service),
) -> MatchTracksResponse:
    try:
        session = import_service.get_session(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error
    deduped = dedupe_service.dedupe_session(session)
    return matching_service.match_tracks(session_id, deduped.tracks)


@router.post("/sessions/{session_id}/match-jobs", response_model=MatchJobResponse)
def start_import_session_match_job(
    session_id: str,
    background_tasks: BackgroundTasks,
    import_service: FullImportService = Depends(get_full_import_service),
    dedupe_service: TrackDedupeService = Depends(get_track_dedupe_service),
    matching_service: TrackMatchingService = Depends(get_track_matching_service),
    job_service: MatchJobService = Depends(get_match_job_service),
) -> MatchJobResponse:
    try:
        session = import_service.get_session(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error

    deduped = dedupe_service.dedupe_session(session)
    job = job_service.create_job(session_id, len(deduped.tracks))
    background_tasks.add_task(
        job_service.run_job,
        job.id,
        session_id,
        deduped.tracks,
        matching_service,
    )
    return job


@router.get("/match-jobs/{job_id}", response_model=MatchJobResponse)
def get_import_session_match_job(
    job_id: str,
    job_service: MatchJobService = Depends(get_match_job_service),
) -> MatchJobResponse:
    try:
        return job_service.get_job(job_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Match job not found.") from error


@router.post("/sessions/{session_id}/matches/confirm", response_model=MatchedTrackItem)
def confirm_import_session_track_match(
    session_id: str,
    request: ManualMatchConfirmRequest,
    import_service: FullImportService = Depends(get_full_import_service),
    dedupe_service: TrackDedupeService = Depends(get_track_dedupe_service),
    matching_service: TrackMatchingService = Depends(get_track_matching_service),
) -> MatchedTrackItem:
    try:
        session = import_service.get_session(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Import session not found.") from error
    track = find_track_for_confirmation(
        dedupe_service.dedupe_session(session).tracks,
        request.source_track_ids,
    )
    return matching_service.confirm_manual_match(track, request)


def find_track_for_confirmation(tracks, source_track_ids):
    requested = set(source_track_ids)
    for track in tracks:
        if requested.issubset(set(track.source_track_ids)):
            return track
    raise HTTPException(status_code=404, detail="Track match target not found.")
