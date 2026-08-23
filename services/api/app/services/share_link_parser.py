from urllib.parse import parse_qs, urlparse
import re

from app.domain.playlist_preview import ExtractedPlaylistLink

URL_PATTERN = re.compile(r"https?://[^\s，。、《》\"'<>]+")


class ShareLinkParseError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message


def extract_playlist_links(raw_texts: list[str]) -> list[ExtractedPlaylistLink]:
    links: list[ExtractedPlaylistLink] = []
    seen: set[str] = set()

    for raw_text in raw_texts:
        for url in extract_urls(raw_text):
            link = canonicalize_playlist_url(url)
            if link.canonical_url in seen:
                continue
            seen.add(link.canonical_url)
            links.append(link)

    if not links:
        raise ShareLinkParseError("invalid_share_link", "No playlist URL found.")

    return links


def extract_urls(raw_text: str) -> list[str]:
    urls: list[str] = []
    for match in URL_PATTERN.finditer(raw_text):
        urls.extend(split_joined_urls(match.group(0)))

    return [url for url in urls if url]


def canonicalize_playlist_url(url: str) -> ExtractedPlaylistLink:
    url = unescape_markdown_url(url)
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    query = merged_query(parsed.query, parsed.fragment)
    path = f"{parsed.path}/{parsed.fragment}"

    if "music.163.com" in host:
        playlist_id = extract_netease_playlist_id(path, query)
        return ExtractedPlaylistLink(
            platform="netease",
            canonical_url=f"https://music.163.com/playlist?id={playlist_id}",
            source_playlist_id=playlist_id,
        )

    if "y.qq.com" in host or "c.y.qq.com" in host:
        playlist_id = extract_qq_playlist_id(path, query)
        return ExtractedPlaylistLink(
            platform="qq",
            canonical_url=f"https://y.qq.com/n/ryqq/playlist/{playlist_id}",
            source_playlist_id=playlist_id,
        )

    raise ShareLinkParseError("unsupported_platform", "Unsupported playlist platform.")


def extract_netease_playlist_id(path: str, query: str) -> str:
    query_params = parse_qs(query)
    playlist_id = first_query_value(query_params, "id")
    if playlist_id:
        return playlist_id

    match = re.search(r"/playlist/(\d+)", path)
    if match:
        return match.group(1)

    raise ShareLinkParseError("invalid_share_link", "Missing NetEase playlist id.")


def extract_qq_playlist_id(path: str, query: str) -> str:
    query_params = parse_qs(query)
    for key in ("id", "disstid", "tid"):
        playlist_id = first_query_value(query_params, key)
        if playlist_id:
            return playlist_id

    match = re.search(r"/playlist/([^/?#]+)", path)
    if match:
        return match.group(1)

    raise ShareLinkParseError("invalid_share_link", "Missing QQ Music playlist id.")


def first_query_value(query_params: dict[str, list[str]], key: str) -> str | None:
    values = query_params.get(key)
    if not values:
        return None

    value = values[0].strip()
    return value or None


def trim_url(url: str) -> str:
    return url.rstrip(").,，。；;！!】]")


def split_joined_urls(url: str) -> list[str]:
    starts = [match.start() for match in re.finditer(r"https?://", url)]
    return [
        trim_url(url[start : starts[index + 1] if index + 1 < len(starts) else len(url)])
        for index, start in enumerate(starts)
    ]


def merged_query(query: str, fragment: str) -> str:
    if "?" not in fragment:
        return query

    fragment_query = fragment.split("?", 1)[1]
    if query:
        return f"{query}&{fragment_query}"

    return fragment_query


def unescape_markdown_url(url: str) -> str:
    return url.replace("\\&", "&").replace("\\?", "?").replace("\\#", "#")
