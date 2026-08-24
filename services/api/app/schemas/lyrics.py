from pydantic import BaseModel


class LyricLine(BaseModel):
    time_ms: int
    text: str
    translation: str | None = None


class LyricsResponse(BaseModel):
    track_id: str
    original_lrc: str
    translated_lrc: str | None = None
    parsed_lines: list[LyricLine]
