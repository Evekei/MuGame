from dataclasses import dataclass


@dataclass(frozen=True)
class ExtractedPlaylistLink:
    platform: str
    canonical_url: str
    source_playlist_id: str
