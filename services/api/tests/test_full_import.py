from pathlib import Path

from app.integrations.playlist_full import FullPlaylistAdapter
from app.repositories.import_repository import ImportRepository
from app.schemas.imports import ConfirmedSourcePlaylist, FullImportRequest, SourceTrackItem
from app.services.full_import import FullImportService


class SameTitleAdapter(FullPlaylistAdapter):
    platform = "netease"

    def fetch_full_playlist(self, source, on_progress):
        on_progress(1, source.track_count)
        return [
            SourceTrackItem(
                id=f"track-{source.owner_source_id}",
                platform=source.platform,
                source_track_id=f"song-{source.owner_source_id}",
                title="同一首歌",
                artists=["Same Artist"],
                album="Same Album",
                duration_ms=180000,
                cover_url=None,
                source_playlist_id=source.source_playlist_id,
                owner_source_id=source.owner_source_id,
                owner_nickname=source.owner_nickname,
            )
        ]


class FlakyAdapter(SameTitleAdapter):
    def __init__(self) -> None:
        self.should_fail = True

    def fetch_full_playlist(self, source, on_progress):
        if self.should_fail:
            self.should_fail = False
            raise RuntimeError("temporary failure")
        return super().fetch_full_playlist(source, on_progress)


def test_full_import_keeps_raw_tracks_for_each_owner(tmp_path: Path) -> None:
    repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    service = FullImportService(repository, {"netease": SameTitleAdapter()})

    session = service.create_session(
        FullImportRequest(
            source_playlists=[
                source_playlist("1", "owner-a", "Alice"),
                source_playlist("2", "owner-b", "Bob"),
            ]
        )
    )
    service.run_import(session.id)

    imported = service.get_session(session.id)

    assert imported.status == "ready"
    assert imported.raw_track_count == 2
    assert [track.title for track in imported.tracks] == ["同一首歌", "同一首歌"]
    assert {track.owner_nickname for track in imported.tracks} == {"Alice", "Bob"}
    assert {track.source_playlist_id for track in imported.tracks} == {"1", "2"}


def test_full_import_records_failed_source_without_rollback(tmp_path: Path) -> None:
    repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    service = FullImportService(repository, {"netease": SameTitleAdapter()})

    session = service.create_session(
        FullImportRequest(
            source_playlists=[
                source_playlist("1", "owner-a", "Alice"),
                source_playlist("2", "owner-b", "Bob", platform="qq"),
            ]
        )
    )
    service.run_import(session.id)

    imported = service.get_session(session.id)

    assert imported.status == "partial_failed"
    assert imported.raw_track_count == 1
    assert imported.source_playlists[0].status == "ready"
    assert imported.source_playlists[1].status == "failed"
    assert imported.tracks[0].owner_nickname == "Alice"


def test_failed_source_can_retry_without_new_session(tmp_path: Path) -> None:
    repository = ImportRepository(str(tmp_path / "imports.sqlite3"))
    service = FullImportService(repository, {"netease": FlakyAdapter()})

    session = service.create_session(
        FullImportRequest(source_playlists=[source_playlist("1", "owner-a", "Alice")])
    )
    service.run_import(session.id)

    failed = service.get_session(session.id)
    retried = service.retry_failed(session.id)

    assert failed.status == "failed"
    assert failed.source_playlists[0].status == "failed"
    assert retried.status == "ready"
    assert retried.raw_track_count == 1
    assert retried.tracks[0].owner_nickname == "Alice"


def source_playlist(
    playlist_id: str,
    owner_id: str,
    owner_name: str,
    platform: str = "netease",
) -> ConfirmedSourcePlaylist:
    return ConfirmedSourcePlaylist(
        platform=platform,
        canonical_url=f"https://music.163.com/playlist?id={playlist_id}",
        source_playlist_id=playlist_id,
        title=f"{owner_name} 的歌单",
        owner_source_id=owner_id,
        owner_nickname=owner_name,
        track_count=1,
    )
