from pathlib import Path

from app.schemas.imports import FullImportRequest
from test_import_orchestrator import (
    orchestrator_fixture,
    poll_session,
    source_playlist,
)


def test_orchestrator_syncs_only_sampled_tracks(tmp_path: Path):
    orchestrator, import_repo, _mapping_repo, adapter = orchestrator_fixture(tmp_path)

    session = orchestrator.start(
        FullImportRequest(
            source_playlists=[
                source_playlist(
                    "101",
                    "owner-a",
                    "Alice",
                    track_count=5,
                    import_track_limit=2,
                )
            ]
        )
    )
    ready = poll_session(import_repo, session.id, "ready_to_play")

    synced_ids = [track.netease_song_id for track in ready.playback.tracks]
    assert ready.raw_track_count == 2
    assert ready.progress.read.current == 2
    assert ready.progress.read.total == 2
    assert len(ready.tracks) == 2
    assert len(synced_ids) == 2
    assert sorted(adapter.tracks) == sorted(synced_ids)
