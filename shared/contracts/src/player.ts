export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface PlaybackState {
  state: PlaybackStatus;
  currentTimeMs: number;
  durationMs: number;
  currentTrackId?: string;
  lastError?: string;
}

export interface PlayerTrack {
  id: string;
  netease_song_id: string;
  display_title: string;
  artists: string[];
  duration_ms?: number;
  cover_url?: string;
}

export interface LyricLine {
  time_ms: number;
  text: string;
  translation?: string;
}

export interface LyricsResponse {
  track_id: string;
  original_lrc: string;
  translated_lrc?: string;
  parsed_lines: LyricLine[];
}
