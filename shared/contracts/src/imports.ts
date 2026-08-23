export type PlaylistPlatform = "netease" | "qq";

export type PlaylistPreviewStatus = "ready" | "failed";

export interface ImportPreviewRequest {
  raw_share_texts: string[];
}

export interface PlaylistPreviewError {
  code: string;
  message: string;
}

export interface PlaylistPreviewItem {
  platform?: PlaylistPlatform;
  canonical_url?: string;
  source_playlist_id?: string;
  title?: string;
  owner_source_id?: string;
  owner_nickname?: string;
  owner_avatar_url?: string;
  cover_url?: string;
  track_count?: number;
  preview_status: PlaylistPreviewStatus;
  error?: PlaylistPreviewError;
}

export interface ImportPreviewResponse {
  items: PlaylistPreviewItem[];
}

export interface ConfirmedSourcePlaylist {
  platform: PlaylistPlatform;
  canonical_url: string;
  source_playlist_id: string;
  title: string;
  owner_source_id: string;
  owner_nickname: string;
  owner_avatar_url?: string;
  cover_url?: string;
  track_count?: number;
}

export interface FullImportRequest {
  source_playlists: ConfirmedSourcePlaylist[];
}

export interface SourceTrackItem {
  id: string;
  platform: PlaylistPlatform;
  source_track_id: string;
  title: string;
  artists: string[];
  album?: string;
  duration_ms?: number;
  cover_url?: string;
  source_playlist_id: string;
  owner_source_id: string;
  owner_nickname: string;
  owner_avatar_url?: string;
}

export type SourcePlaylistImportStatus =
  | "pending"
  | "reading"
  | "ready"
  | "failed";

export type ImportSessionStatus =
  | "pending"
  | "reading"
  | "ready"
  | "partial_failed"
  | "failed";

export interface SourcePlaylistImportResult extends ConfirmedSourcePlaylist {
  id: string;
  status: SourcePlaylistImportStatus;
  read_count: number;
  error?: PlaylistPreviewError;
}

export interface ImportSessionResponse {
  id: string;
  status: ImportSessionStatus;
  raw_track_count: number;
  source_playlists: SourcePlaylistImportResult[];
  tracks: SourceTrackItem[];
  created_at: string;
  updated_at: string;
}

export interface Contributor {
  platform: PlaylistPlatform;
  source_playlist_id: string;
  owner_source_id: string;
  owner_nickname: string;
  owner_avatar_url?: string;
}

export interface UnifiedTrackItem {
  id: string;
  normalized_title: string;
  display_title: string;
  artists: string[];
  normalized_artists: string[];
  album?: string;
  normalized_album?: string;
  duration_ms?: number;
  cover_url?: string;
  source_track_ids: string[];
  contributors: Contributor[];
  explain_dedup_reason: string;
}

export interface DedupeTracksResponse {
  import_session_id: string;
  raw_track_count: number;
  unique_track_count: number;
  tracks: UnifiedTrackItem[];
}

export interface NeteaseTrackCandidate {
  netease_song_id: string;
  title: string;
  artists: string[];
  album?: string;
  duration_ms?: number;
  score: number;
  reason: string;
}

export type MatchStatus =
  | "auto_accepted"
  | "needs_confirm"
  | "no_match"
  | "manual_confirmed";

export interface MatchedTrackItem {
  id: string;
  display_title: string;
  artists: string[];
  album?: string;
  duration_ms?: number;
  source_track_ids: string[];
  contributors: Contributor[];
  match_status: MatchStatus;
  netease_song_id?: string;
  match_confidence: number;
  match_reason: string;
  candidates: NeteaseTrackCandidate[];
}

export interface MatchTracksResponse {
  import_session_id: string;
  total_track_count: number;
  auto_matched_count: number;
  needs_confirm_count: number;
  no_match_count: number;
  tracks: MatchedTrackItem[];
}

export type MatchJobStatus =
  | "pending"
  | "running"
  | "ready"
  | "failed"
  | "rate_limited";

export interface MatchJobResponse {
  id: string;
  import_session_id: string;
  status: MatchJobStatus;
  processed_track_count: number;
  total_track_count: number;
  auto_matched_count: number;
  needs_confirm_count: number;
  no_match_count: number;
  current_title?: string;
  error?: string;
  result?: MatchTracksResponse;
}

export interface ManualMatchConfirmRequest {
  source_track_ids: string[];
  netease_song_id: string;
  title: string;
  artists: string[];
  album?: string;
  duration_ms?: number;
}

export type TempPlaylistSyncStatus = "ready" | "partial_failed";

export interface TempPlaylistBatchResult {
  operation: "add" | "remove";
  start_index: number;
  track_count: number;
  attempt: number;
  status: "ok" | "failed";
  error?: string;
}

export interface TempPlaylistSyncResponse {
  import_session_id: string;
  temp_playlist_id: string;
  status: TempPlaylistSyncStatus;
  synced_count: number;
  skipped_count: number;
  failed_count: number;
  ready_at?: string;
  batches: TempPlaylistBatchResult[];
  error?: string;
}
