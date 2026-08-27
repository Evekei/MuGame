import { beforeEach, describe, expect, it } from "vitest";
import {
  getImportFlowState,
  hydrateImportFlowState,
  resetImportFlowState,
  setImportFlowState,
  setStoredImportSession
} from "./importFlowStore";

describe("importFlowStore", () => {
  beforeEach(() => {
    resetImportFlowState();
  });

  it("persists and restores preview, session, ready payload, and limit", () => {
    setImportFlowState({
      importTrackLimit: 40,
      previewItems: [readyPreviewItem()],
      rawShareText: "playlist link"
    });
    setStoredImportSession(readySession());
    resetInMemoryOnly();

    hydrateImportFlowState();

    expect(getImportFlowState()).toMatchObject({
      importTrackLimit: 40,
      rawShareText: "playlist link",
      sessionId: "session-1",
      readyPayload: {
        tempPlaylistId: "temp-1"
      }
    });
    expect(getImportFlowState().previewItems).toHaveLength(1);
  });

  it("falls back to an empty state when storage is corrupted", () => {
    window.localStorage.setItem("mugame.import.flow", "{bad");
    resetInMemoryOnly();

    hydrateImportFlowState();

    expect(getImportFlowState()).toMatchObject({
      previewItems: [],
      rawShareText: ""
    });
  });

  it("keeps the ready payload stable when polling returns the same playback tracks", () => {
    setStoredImportSession(readySession());
    const firstPayload = getImportFlowState().readyPayload;

    setStoredImportSession({
      ...readySession(),
      analytics_status: "completed" as const,
      updated_at: "2026-08-27T00:00:02Z"
    });

    expect(getImportFlowState().readyPayload).toBe(firstPayload);
  });
});

function resetInMemoryOnly() {
  const stored = window.localStorage.getItem("mugame.import.flow");
  resetImportFlowState();
  if (stored) {
    window.localStorage.setItem("mugame.import.flow", stored);
  }
}

function readyPreviewItem() {
  return {
    preview_status: "ready" as const,
    platform: "netease" as const,
    canonical_url: "https://music.163.com/playlist?id=1",
    source_playlist_id: "1",
    title: "朋友的歌单",
    owner_source_id: "owner-a",
    owner_nickname: "Alice"
  };
}

function readySession() {
  return {
    id: "session-1",
    status: "ready_to_play" as const,
    raw_track_count: 1,
    source_playlists: [],
    tracks: [],
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    analytics_results: [],
    matched_tracks: [matchedTrack()],
    playback: {
      temp_playlist_id: "temp-1",
      tracks: [matchedTrack()]
    }
  };
}

function matchedTrack() {
  return {
    id: "track-1",
    display_title: "夜曲",
    artists: ["周杰伦"],
    source_track_ids: ["netease:song-1"],
    contributors: [
      {
        platform: "netease" as const,
        source_playlist_id: "1",
        owner_source_id: "owner-a",
        owner_nickname: "Alice"
      }
    ],
    match_status: "auto_accepted" as const,
    netease_song_id: "song-1",
    match_confidence: 1,
    match_reason: "test",
    candidates: []
  };
}
