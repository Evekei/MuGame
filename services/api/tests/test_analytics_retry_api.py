from fastapi.testclient import TestClient

from app.api.imports import get_import_orchestrator
from app.main import create_app
from app.schemas.imports import ImportSessionResponse


def test_retry_import_analytics_calls_orchestrator() -> None:
    orchestrator = FakeOrchestrator()
    app = create_app()
    app.dependency_overrides[get_import_orchestrator] = lambda: orchestrator

    try:
        response = TestClient(app).post("/imports/sessions/session-1/analytics/retry")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["analytics_status"] == "pending"
    assert orchestrator.retried_session_id == "session-1"


class FakeOrchestrator:
    def __init__(self) -> None:
        self.retried_session_id: str | None = None

    def retry_analytics(self, session_id: str) -> ImportSessionResponse:
        self.retried_session_id = session_id
        return ImportSessionResponse(
            id=session_id,
            status="ready_to_play",
            raw_track_count=0,
            source_playlists=[],
            tracks=[],
            created_at="2026-08-26T00:00:00Z",
            updated_at="2026-08-26T00:00:00Z",
            analytics_results=[],
            analytics_status="pending",
            matched_tracks=[],
        )
