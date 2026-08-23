from app.integrations.playlist_preview import PlaylistPreviewAdapter
from app.schemas.imports import (
    ImportPreviewResponse,
    PlaylistPreviewError,
    PlaylistPreviewItem,
)
from app.services.share_link_parser import (
    ShareLinkParseError,
    canonicalize_playlist_url,
    extract_urls,
)


class ImportPreviewService:
    def __init__(self, adapters: dict[str, PlaylistPreviewAdapter]):
        self.adapters = adapters

    def preview(self, raw_share_texts: list[str]) -> ImportPreviewResponse:
        items: list[PlaylistPreviewItem] = []
        seen: set[str] = set()

        for raw_text in raw_share_texts:
            urls = extract_urls(raw_text)
            if not urls:
                items.append(failed_item("invalid_share_link", "No playlist URL found."))
                continue

            for url in urls:
                item = self._preview_url(url)
                if item.canonical_url and item.canonical_url in seen:
                    continue
                if item.canonical_url:
                    seen.add(item.canonical_url)
                items.append(item)

        return ImportPreviewResponse(items=items)

    def _preview_url(self, url: str) -> PlaylistPreviewItem:
        try:
            link = canonicalize_playlist_url(url)
        except ShareLinkParseError as error:
            return failed_item(error.code, error.message)

        adapter = self.adapters.get(link.platform)
        if adapter is None:
            return failed_item("unsupported_platform", "Unsupported playlist platform.")

        try:
            return adapter.preview(link)
        except Exception:
            return PlaylistPreviewItem(
                platform=link.platform,
                canonical_url=link.canonical_url,
                source_playlist_id=link.source_playlist_id,
                preview_status="failed",
                error=PlaylistPreviewError(
                    code="playlist_parse_failed",
                    message="Failed to preview playlist.",
                ),
            )


def failed_item(code: str, message: str) -> PlaylistPreviewItem:
    return PlaylistPreviewItem(
        preview_status="failed",
        error=PlaylistPreviewError(code=code, message=message),
    )
