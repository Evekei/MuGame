import type { Contributor } from "./imports";

export interface PlayerTrack {
  id: string;
  netease_song_id: string;
  display_title: string;
  artists: string[];
  contributors: Contributor[];
  duration_ms?: number;
  cover_url?: string;
}

export type NeteasePlaybackMonitorStatus =
  | "unsupported"
  | "permission_required"
  | "not_playing"
  | "ready";

export interface NeteasePlaybackMetadata {
  status: NeteasePlaybackMonitorStatus;
  package_name?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration_ms?: number;
  media_id?: string;
  playback_state?: string;
  updated_at_ms: number;
}
