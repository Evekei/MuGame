from app.domain.track_dedupe import dedupe_source_tracks
from app.schemas.imports import SourceTrackItem


def test_same_song_from_two_users_merges_contributors() -> None:
    tracks = [
        source_track("netease", "song-1", "playlist-a", "owner-a", "Alice"),
        source_track("netease", "song-1", "playlist-b", "owner-b", "Bob"),
    ]

    deduped = dedupe_source_tracks(tracks)

    assert len(deduped) == 1
    assert {item.owner_nickname for item in deduped[0].contributors} == {
        "Alice",
        "Bob",
    }
    assert "merged_by_platform_track_id" in deduped[0].explain_dedup_reason


def test_same_title_different_artist_does_not_merge() -> None:
    tracks = [
        source_track("netease", "song-1", "playlist-a", "owner-a", "Alice"),
        source_track(
            "qq",
            "song-2",
            "playlist-b",
            "owner-b",
            "Bob",
            artists=["Other Artist"],
        ),
    ]

    assert len(dedupe_source_tracks(tracks)) == 2


def test_original_and_live_versions_do_not_merge() -> None:
    tracks = [
        source_track("netease", "song-1", "playlist-a", "owner-a", "Alice"),
        source_track(
            "qq",
            "song-2",
            "playlist-b",
            "owner-b",
            "Bob",
            title="同一首歌 Live",
        ),
    ]

    assert len(dedupe_source_tracks(tracks)) == 2


def test_duplicate_track_from_same_user_playlist_keeps_one_contributor() -> None:
    tracks = [
        source_track("netease", "song-1", "playlist-a", "owner-a", "Alice"),
        source_track("netease", "song-1", "playlist-a", "owner-a", "Alice"),
    ]

    deduped = dedupe_source_tracks(tracks)

    assert len(deduped) == 1
    assert len(deduped[0].contributors) == 1


def test_three_users_common_song_merges_all_contributors_with_avatars() -> None:
    tracks = [
        source_track("netease", "song-1", "playlist-a", "owner-a", "Alice", "a.jpg"),
        source_track("qq", "song-2", "playlist-b", "owner-b", "Bob", "b.jpg"),
        source_track("netease", "song-3", "playlist-c", "owner-c", "Cara", "c.jpg"),
    ]

    deduped = dedupe_source_tracks(tracks)

    assert len(deduped) == 1
    assert {item.owner_nickname for item in deduped[0].contributors} == {
        "Alice",
        "Bob",
        "Cara",
    }
    assert {item.owner_avatar_url for item in deduped[0].contributors} == {
        "a.jpg",
        "b.jpg",
        "c.jpg",
    }
    assert "merged_by_normalized_title" in deduped[0].explain_dedup_reason


def source_track(
    platform: str,
    source_track_id: str,
    playlist_id: str,
    owner_id: str,
    owner_name: str,
    avatar_url: str | None = None,
    title: str = "同一首歌",
    artists: list[str] | None = None,
) -> SourceTrackItem:
    return SourceTrackItem(
        id=f"{playlist_id}-{source_track_id}",
        platform=platform,
        source_track_id=source_track_id,
        title=title,
        artists=artists or ["Same Artist"],
        album="Album",
        duration_ms=180000,
        cover_url=None,
        source_playlist_id=playlist_id,
        owner_source_id=owner_id,
        owner_nickname=owner_name,
        owner_avatar_url=avatar_url,
    )
