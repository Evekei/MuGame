from dataclasses import dataclass
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from app.api.account import (
    get_account_session_repository,
    get_netease_account_client,
)
from app.integrations.netease.account_client import NeteaseSessionExpired
from app.main import create_app
from app.repositories.account_session_repository import AccountSessionRepository
from app.schemas.account import NeteaseAccountProfile


@dataclass
class FakeNeteaseAccountClient:
    expired: bool = False

    def verify_session(self, cookies: dict[str, str]) -> NeteaseAccountProfile:
        if self.expired or "MUSIC_U" not in cookies:
            raise NeteaseSessionExpired()

        return NeteaseAccountProfile(
            user_id="42",
            nickname="Netease Alice",
            avatar_url="https://example.test/avatar.png",
        )


@pytest.fixture
def account_client(tmp_path: Path):
    app = create_app()
    repository = AccountSessionRepository(str(tmp_path / "account.sqlite3"))
    fake_netease = FakeNeteaseAccountClient()

    app.dependency_overrides[get_account_session_repository] = lambda: repository
    app.dependency_overrides[get_netease_account_client] = lambda: fake_netease

    return TestClient(app), fake_netease, repository


def test_account_session_starts_logged_out(account_client) -> None:
    client, _fake_netease, _repository = account_client

    response = client.get("/account/netease/session")

    assert response.status_code == 200
    assert response.json()["status"] == "logged_out"


def test_post_session_validates_profile_and_persists(account_client) -> None:
    client, _fake_netease, repository = account_client

    response = client.post(
        "/account/netease/session",
        json={
            "cookies": [
                {"name": "MUSIC_U", "value": "secret-cookie"},
                {"name": "unrelated", "value": "drop-me"},
            ],
            "captured_at": "2026-08-23T00:00:00+00:00",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "logged_in"
    assert payload["profile"]["user_id"] == "42"

    record = repository.get_netease_session()
    assert record is not None
    assert record.cookies == {"MUSIC_U": "secret-cookie"}


def test_read_session_marks_expired_and_clears_storage(account_client) -> None:
    client, fake_netease, repository = account_client
    client.post(
        "/account/netease/session",
        json={"cookies": [{"name": "MUSIC_U", "value": "secret-cookie"}]},
    )
    fake_netease.expired = True

    response = client.get("/account/netease/session")

    assert response.status_code == 200
    assert response.json()["status"] == "expired"
    assert repository.get_netease_session() is None


def test_delete_session_clears_backend_storage(account_client) -> None:
    client, _fake_netease, repository = account_client
    client.post(
        "/account/netease/session",
        json={"cookies": [{"name": "MUSIC_U", "value": "secret-cookie"}]},
    )

    response = client.delete("/account/netease/session")

    assert response.status_code == 200
    assert response.json()["status"] == "logged_out"
    assert repository.get_netease_session() is None


def test_invalid_snapshot_returns_expired(account_client) -> None:
    client, _fake_netease, repository = account_client

    response = client.post(
        "/account/netease/session",
        json={"cookies": [{"name": "__csrf", "value": "csrf-only"}]},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "expired"
    assert repository.get_netease_session() is None
