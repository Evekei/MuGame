from pathlib import Path

from app.repositories.account_session_repository import AccountSessionRepository
from app.schemas.account import NeteaseAccountProfile


def test_account_session_repository_saves_reads_and_clears(tmp_path: Path) -> None:
    repository = AccountSessionRepository(str(tmp_path / "account.sqlite3"))
    profile = NeteaseAccountProfile(
        user_id="42",
        nickname="Netease Alice",
        avatar_url="https://example.test/avatar.png",
    )

    repository.save_netease_session({"MUSIC_U": "secret-cookie"}, profile)
    record = repository.get_netease_session()

    assert record is not None
    assert record.cookies == {"MUSIC_U": "secret-cookie"}
    assert record.profile.nickname == "Netease Alice"

    repository.clear_netease_session()

    assert repository.get_netease_session() is None
