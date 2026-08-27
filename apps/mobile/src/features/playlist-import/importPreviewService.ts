import type {
  ConfirmedSourcePlaylist,
  ImportHistoryItem,
  ImportSessionResponse,
  ImportPreviewResponse,
  MatchJobResponse,
  ManualMatchConfirmRequest,
  MatchedTrackItem,
  MatchTracksResponse,
  PlaylistPreviewItem,
  TempPlaylistSyncResponse
} from "@mugame/contracts/imports";
import {
  importPreviewApi,
  type ImportPreviewApi
} from "./importPreviewApi";

let api: ImportPreviewApi = importPreviewApi;

export function configureImportPreviewService(nextApi: ImportPreviewApi) {
  api = nextApi;
}

export function resetImportPreviewService() {
  api = importPreviewApi;
}

export function previewPlaylists(
  rawShareText: string
): Promise<ImportPreviewResponse> {
  const raw_share_texts = splitShareText(rawShareText);
  return api.preview({ raw_share_texts });
}

export function startFullImport(
  items: PlaylistPreviewItem[]
): Promise<ImportSessionResponse> {
  return api.startFullImport({
    source_playlists: items
      .filter(isReadyPreviewItem)
      .map((item) => toConfirmedSourcePlaylist(item))
  });
}

export function startImportOrchestration(
  items: PlaylistPreviewItem[],
  options: { importTrackLimit?: number } = {}
): Promise<ImportSessionResponse> {
  return api.startOrchestration({
    source_playlists: items
      .filter(isReadyPreviewItem)
      .map((item) => toConfirmedSourcePlaylist(item, options.importTrackLimit))
  });
}

export function getImportSession(
  sessionId: string
): Promise<ImportSessionResponse> {
  return api.getSession(sessionId);
}

export function getImportHistory(limit = 20): Promise<ImportHistoryItem[]> {
  return api.getHistory(limit);
}

export function restoreTempPlaylist(sessionId: string): Promise<ImportSessionResponse> {
  return api.restoreTempPlaylist(sessionId);
}

export function deleteImportSession(sessionId: string) {
  return api.deleteImportSession(sessionId);
}

export function retryFullImport(sessionId: string): Promise<ImportSessionResponse> {
  return api.retryFullImport(sessionId);
}

export function retryImportAnalytics(
  sessionId: string
): Promise<ImportSessionResponse> {
  return api.retryAnalytics(sessionId);
}

export function matchImportSession(sessionId: string): Promise<MatchTracksResponse> {
  return api.matchTracks(sessionId);
}

export function startMatchJob(sessionId: string): Promise<MatchJobResponse> {
  return api.startMatchJob(sessionId);
}

export function getMatchJob(jobId: string): Promise<MatchJobResponse> {
  return api.getMatchJob(jobId);
}

export function syncTempPlaylist(
  sessionId: string
): Promise<TempPlaylistSyncResponse> {
  return api.syncTempPlaylist(sessionId);
}

export function confirmManualMatch(
  sessionId: string,
  request: ManualMatchConfirmRequest
): Promise<MatchedTrackItem> {
  return api.confirmMatch(sessionId, request);
}

export function splitShareText(rawShareText: string) {
  const urls = Array.from(rawShareText.matchAll(URL_PATTERN), (match) =>
    splitJoinedUrls(match[0])
  )
    .flat()
    .filter(Boolean);

  if (urls.length > 0) {
    return urls;
  }

  return rawShareText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const URL_PATTERN = /https?:\/\/[^\s，。、《》"'<>]+/g;

function splitJoinedUrls(url: string) {
  const starts = Array.from(url.matchAll(HTTP_START_PATTERN), (match) => match.index ?? 0);

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? url.length;
    return trimUrl(url.slice(start, end));
  });
}

const HTTP_START_PATTERN = /https?:\/\//g;

function trimUrl(url: string) {
  return url.replace(/[).,，。；;！!\]】]+$/g, "");
}

function isReadyPreviewItem(
  item: PlaylistPreviewItem
): item is PlaylistPreviewItem & Required<Pick<
  PlaylistPreviewItem,
  "platform" | "canonical_url" | "source_playlist_id" | "title" | "owner_source_id" | "owner_nickname"
>> {
  return (
    item.preview_status === "ready" &&
    Boolean(item.platform) &&
    Boolean(item.canonical_url) &&
    Boolean(item.source_playlist_id) &&
    Boolean(item.title) &&
    Boolean(item.owner_source_id) &&
    Boolean(item.owner_nickname)
  );
}

function toConfirmedSourcePlaylist(
  item: PlaylistPreviewItem & Required<Pick<
    PlaylistPreviewItem,
    "platform" | "canonical_url" | "source_playlist_id" | "title" | "owner_source_id" | "owner_nickname"
  >>,
  importTrackLimit?: number
): ConfirmedSourcePlaylist {
  const playlist: ConfirmedSourcePlaylist = {
    platform: item.platform,
    canonical_url: item.canonical_url,
    source_playlist_id: item.source_playlist_id,
    title: item.title,
    owner_source_id: item.owner_source_id,
    owner_nickname: item.owner_nickname,
    owner_avatar_url: item.owner_avatar_url,
    cover_url: item.cover_url,
    source_tags: item.source_tags ?? [],
    track_count: item.track_count
  };
  if (importTrackLimit !== undefined) {
    playlist.import_track_limit = importTrackLimit;
  }
  return playlist;
}
