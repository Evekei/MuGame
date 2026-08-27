from app.schemas.dedupe import Contributor
from app.schemas.imports import ImportSessionResponse, SourcePlaylistImportResult
from app.schemas.matching import GenreAssignment, MatchedTrackItem
from app.services.analytics_v2 import compute_analytics_v2


def test_analytics_v2_uses_traceable_genres_and_exact_distribution_math() -> None:
    metrics = compute_analytics_v2(analytics_v2_session())

    assert metrics["genre_assignments"]["data_coverage"] == {
        "known_track_count": 3,
        "total_track_count": 4,
        "ratio": 0.75,
    }
    assert metrics["genre_assignments"]["confidence"] == {
        "average": 0.716667,
        "assignment_count": 3,
    }
    assert metrics["genre_assignments"]["tracks"][2]["assignments"] == [
        {
            "genre": "pop",
            "source": "source_playlist_tag:p2",
            "confidence": 0.45,
        }
    ]
    assert metrics["genre_assignments"]["tracks"][3]["assignments"] == [
        {"genre": "UNKNOWN", "source": "unknown", "confidence": 0.0}
    ]
    for track in metrics["genre_assignments"]["tracks"]:
        for assignment in track["assignments"]:
            assert "source" in assignment
            assert "confidence" in assignment
    assert all(item["genre"] != "UNKNOWN" for item in metrics["top_genres"]["overall"])
    assert metrics["top_genres"]["overall"] == [
        {"genre": "pop", "weighted_count": 2.25, "share": 0.737705},
        {"genre": "rock", "weighted_count": 0.8, "share": 0.262295},
    ]
    assert metrics["shared_genres"]["genres"] == [
        {"genre": "pop", "participant_count": 2, "unique_track_count": 2}
    ]
    assert metrics["pairwise_genre_similarity"]["pairs"][0] == {
        "owner_a": {"owner_source_id": "alice", "owner_nickname": "Alice"},
        "owner_b": {"owner_source_id": "bob", "owner_nickname": "Bob"},
        "algorithm": "weighted_jaccard_normalized_distribution",
        "jaccard": 0.36,
        "owner_a_distribution": {"pop": 0.529412, "rock": 0.470588},
        "owner_b_distribution": {"pop": 1.0},
        "data_coverage": {"known_track_count": 3, "total_track_count": 4, "ratio": 0.75},
    }


def test_analytics_v2_distribution_similarity_extremes_and_lyric_flag() -> None:
    session = genre_similarity_session()
    metrics = compute_analytics_v2(session)
    pairs = {
        pair_key(pair): pair
        for pair in metrics["pairwise_genre_similarity"]["pairs"]
    }

    assert pairs[("alice", "bob")]["jaccard"] == 1.0
    assert pairs[("alice", "cara")]["jaccard"] == 0.0
    assert pairs[("bob", "cara")]["jaccard"] == 0.0
    assert "lyric_keywords" not in metrics
    assert compute_analytics_v2(session, include_lyric_keywords=True)["lyric_keywords"] == {
        "status": "pending_slow_task",
        "data_coverage": {"known_track_count": 0, "total_track_count": 0, "ratio": 0.0},
    }
    without_lyrics = compute_analytics_v2(session)
    with_lyrics = compute_analytics_v2(session, include_lyric_keywords=True)
    with_lyrics.pop("lyric_keywords")
    assert with_lyrics == without_lyrics


def test_analytics_v2_albums_and_diversity_are_unique_track_based() -> None:
    metrics = compute_analytics_v2(analytics_v2_session())

    assert metrics["top_albums"] == {
        "data_coverage": {"known_track_count": 3, "total_track_count": 4, "ratio": 0.75},
        "albums": [
            {
                "album": "Album One",
                "album_key": "album one",
                "unique_track_count": 2,
                "participant_count": 2,
            },
            {
                "album": "Album Two",
                "album_key": "album two",
                "unique_track_count": 1,
                "participant_count": 1,
            },
        ],
    }
    assert metrics["shared_albums"]["albums"] == [
        {
            "album": "Album One",
            "album_key": "album one",
            "unique_track_count": 2,
            "participant_count": 2,
        }
    ]
    assert metrics["artist_diversity"]["overall"] == {
        "unique_artists": 3,
        "top_artist_share": 0.5,
        "shannon_entropy": 1.5,
    }
    assert metrics["genre_diversity"]["available"] is True
    assert metrics["genre_diversity"]["overall"] == {
        "unique_genres": 2,
        "top_genre_share": 0.737705,
        "shannon_entropy": 0.83019,
    }


def test_analytics_v2_keeps_genre_diversity_unavailable_when_coverage_is_low() -> None:
    session = analytics_v2_session()
    session.matched_tracks = [
        matched_track("t1", "Known", ["Artist A"], "Album", [contributor("p1", "alice", "Alice")]),
        matched_track("t2", "Unknown", ["Artist B"], None, [contributor("p3", "cara", "Cara")]),
    ]
    session.matched_tracks[0].genre_assignments = [
        GenreAssignment(genre="Pop", source="netease_song_tag", confidence=0.9)
    ]

    metrics = compute_analytics_v2(session)

    assert metrics["genre_assignments"]["data_coverage"]["ratio"] == 0.5
    assert metrics["genre_diversity"]["available"] is False
    assert metrics["genre_diversity"]["reason"] == "genre_data_coverage_too_low"
    assert metrics["genre_diversity"]["overall"] is None


def analytics_v2_session() -> ImportSessionResponse:
    return ImportSessionResponse(
        id="session-v2",
        status="ready_to_play",
        raw_track_count=4,
        source_playlists=[
            source_playlist("p1", "alice", "Alice", []),
            source_playlist("p2", "bob", "Bob", ["Pop"]),
            source_playlist("p3", "cara", "Cara", []),
        ],
        tracks=[],
        created_at="2026-08-26T00:00:00Z",
        updated_at="2026-08-26T00:00:00Z",
        matched_tracks=[
            matched_track(
                "t1",
                "Shared Pop",
                ["Artist A"],
                "Album One",
                [contributor("p1", "alice", "Alice"), contributor("p2", "bob", "Bob")],
                [GenreAssignment(genre="Pop", source="netease_song_tag", confidence=0.9)],
            ),
            matched_track(
                "t2",
                "Alice Rock",
                ["Artist B"],
                "Album Two",
                [contributor("p1", "alice", "Alice")],
                [GenreAssignment(genre="Rock", source="netease_album_tag", confidence=0.8)],
            ),
            matched_track(
                "t3",
                "Bob Playlist Tag",
                ["Artist A"],
                "Album One",
                [contributor("p2", "bob", "Bob")],
            ),
            matched_track(
                "t4",
                "Unknown Genre",
                ["Artist C"],
                None,
                [contributor("p3", "cara", "Cara")],
            ),
        ],
    )


def genre_similarity_session() -> ImportSessionResponse:
    tracks = []
    for owner_id, owner_name, playlist_id, genres in [
        ("alice", "Alice", "p1", ["Pop", "Rock"]),
        ("bob", "Bob", "p2", ["Pop", "Rock"]),
        ("cara", "Cara", "p3", ["Jazz"]),
    ]:
        for index, genre in enumerate(genres):
            tracks.append(
                matched_track(
                    f"{owner_id}-{index}",
                    f"{owner_name} {genre}",
                    [f"Artist {genre}"],
                    f"Album {genre}",
                    [contributor(playlist_id, owner_id, owner_name)],
                    [GenreAssignment(genre=genre, source="netease_song_tag", confidence=1)],
                )
            )
    return ImportSessionResponse(
        id="session-similarity",
        status="ready_to_play",
        raw_track_count=len(tracks),
        source_playlists=[
            source_playlist("p1", "alice", "Alice", []),
            source_playlist("p2", "bob", "Bob", []),
            source_playlist("p3", "cara", "Cara", []),
        ],
        tracks=[],
        created_at="2026-08-26T00:00:00Z",
        updated_at="2026-08-26T00:00:00Z",
        matched_tracks=tracks,
    )


def pair_key(pair: dict) -> tuple[str, str]:
    return (
        pair["owner_a"]["owner_source_id"],
        pair["owner_b"]["owner_source_id"],
    )


def source_playlist(
    playlist_id: str,
    owner_id: str,
    owner_name: str,
    source_tags: list[str],
) -> SourcePlaylistImportResult:
    return SourcePlaylistImportResult(
        id=f"{owner_id}:{playlist_id}",
        platform="netease",
        canonical_url=f"https://music.163.com/playlist?id={playlist_id}",
        source_playlist_id=playlist_id,
        title=f"{owner_name} playlist",
        owner_source_id=owner_id,
        owner_nickname=owner_name,
        source_tags=source_tags,
        track_count=1,
        status="ready",
        read_count=1,
    )


def matched_track(
    track_id: str,
    title: str,
    artists: list[str],
    album: str | None,
    contributors: list[Contributor],
    genre_assignments: list[GenreAssignment] | None = None,
) -> MatchedTrackItem:
    return MatchedTrackItem(
        id=track_id,
        display_title=title,
        artists=artists,
        album=album,
        source_track_ids=[f"source:{track_id}"],
        contributors=contributors,
        genre_assignments=genre_assignments or [],
        match_status="auto_accepted",
        netease_song_id=track_id,
        match_confidence=1,
        match_reason="test",
        candidates=[],
    )


def contributor(playlist_id: str, owner_id: str, owner_name: str) -> Contributor:
    return Contributor(
        platform="netease",
        source_playlist_id=playlist_id,
        owner_source_id=owner_id,
        owner_nickname=owner_name,
    )
