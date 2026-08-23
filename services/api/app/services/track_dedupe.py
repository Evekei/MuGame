from app.domain.track_dedupe import dedupe_source_tracks
from app.schemas.dedupe import DedupeTracksResponse
from app.schemas.imports import ImportSessionResponse


class TrackDedupeService:
    def dedupe_session(self, session: ImportSessionResponse) -> DedupeTracksResponse:
        tracks = dedupe_source_tracks(session.tracks)
        return DedupeTracksResponse(
            import_session_id=session.id,
            raw_track_count=len(session.tracks),
            unique_track_count=len(tracks),
            tracks=tracks,
        )
