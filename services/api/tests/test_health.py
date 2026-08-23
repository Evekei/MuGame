from datetime import datetime

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_status_version_and_server_time() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["version"]

    server_time = datetime.fromisoformat(payload["server_time"])
    assert server_time.tzinfo is not None


def test_health_allows_capacitor_origin() -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "https://localhost",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://localhost"
