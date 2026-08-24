from app.core.errors import AppError
from app.domain.lrc_parser import parse_lrc
from app.schemas.lyrics import LyricsResponse


class LyricsService:
    def __init__(self, lyrics_client):
        self.lyrics_client = lyrics_client

    def get_lyrics(self, track_id: str) -> LyricsResponse:
        try:
            original_lrc, translated_lrc = self.lyrics_client.fetch_lyrics(track_id)
        except Exception as error:
            raise AppError(
                "lyric_fetch_failed",
                "Failed to fetch lyrics.",
                502,
            ) from error

        return LyricsResponse(
            track_id=track_id,
            original_lrc=original_lrc,
            translated_lrc=translated_lrc,
            parsed_lines=parse_lrc(original_lrc, translated_lrc),
        )
