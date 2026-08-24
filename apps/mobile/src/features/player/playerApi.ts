import type { LyricsResponse } from "@mugame/contracts/player";
import { getJson } from "@/lib/api/client";

export type LyricsApi = (trackId: string) => Promise<LyricsResponse>;

export const getTrackLyrics: LyricsApi = (trackId) =>
  getJson<LyricsResponse>(`/tracks/${encodeURIComponent(trackId)}/lyrics`);
