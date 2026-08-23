import re
import unicodedata

VERSION_MARKERS = {
    "live": ("live", "现场", "演唱会", "巡演"),
    "remix": ("remix", "混音"),
    "instrumental": ("instrumental", "伴奏", "karaoke"),
    "acoustic": ("acoustic", "不插电", "acoustic"),
    "cover": ("cover", "翻唱"),
    "demo": ("demo",),
}


def normalize_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "").lower()
    normalized = re.sub(r"[^\w\u4e00-\u9fff]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_compact(value: str | None) -> str:
    return normalize_text(value).replace(" ", "")


def normalize_artists(artists: list[str]) -> list[str]:
    return [artist for artist in (normalize_compact(item) for item in artists) if artist]


def primary_artist_key(artists: list[str]) -> str:
    normalized = normalize_artists(artists)
    return normalized[0] if normalized else ""


def version_signature(title: str | None, album: str | None = None) -> str:
    text = normalize_text(f"{title or ''} {album or ''}")
    markers = [
        key
        for key, words in VERSION_MARKERS.items()
        if any(word in text for word in words)
    ]
    return "+".join(markers) if markers else "studio"
