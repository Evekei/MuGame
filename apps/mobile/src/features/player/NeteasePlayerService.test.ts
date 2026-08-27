import type { ImportSessionResponse, MatchedTrackItem } from "@mugame/contracts/imports";
import { describe, expect, it, vi } from "vitest";
import type { NeteasePlayerBridge } from "@/bridges/NeteasePlayerBridge";
import {
  NeteasePlayerService,
  toFloatingAnalyticsSummary,
  toPlayableTracks
} from "./NeteasePlayerService";

describe("NeteasePlayerService", () => {
  it("builds playable metadata from matched NetEase tracks only", () => {
    expect(toPlayableTracks([matched("1"), needsConfirm("2"), noMatch("3")])).toEqual([
      {
        id: "1",
        netease_song_id: "song-1",
        display_title: "Track 1",
        artists: ["Artist"],
        contributors: []
      }
    ]);
  });

  it("loads the NetEase temp playlist during initialization", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({ bridge });

    service.startSession([matched("1"), matched("2")], { tempPlaylistId: "temp-1" });
    await service.initialize();

    expect(bridge.ensureLoggedIn).toHaveBeenCalledOnce();
    expect(bridge.configureSourceReveal).toHaveBeenCalledWith({
      tracks: [
        expect.objectContaining({ netease_song_id: "song-1" }),
        expect.objectContaining({ netease_song_id: "song-2" })
      ]
    });
    expect(bridge.loadPlaylist).toHaveBeenCalledWith({ netease_playlist_id: "temp-1" });
  });

  it("updates floating analytics without reopening playback", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({ bridge });
    const summary = toFloatingAnalyticsSummary(analyticsSession());

    service.startSession([matched("1")], { tempPlaylistId: "temp-1" });
    await service.configureAnalytics(summary);

    expect(bridge.configureSourceReveal).toHaveBeenCalledWith({
      analytics: summary,
      tracks: [expect.objectContaining({ netease_song_id: "song-1" })]
    });
    expect(bridge.loadPlaylist).not.toHaveBeenCalled();
  });

  it("summarizes analytics for the floating window", () => {
    expect(toFloatingAnalyticsSummary(analyticsSession()).lines).toEqual([
      "统计概览",
      "参与 2 人，共 5 首",
      "去重 4 首，共同 1 首",
      "共鸣歌曲：共同歌曲",
      "Top 歌手：Artist A"
    ]);
  });

  it("opens NetEase playback and tears down the bridge", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({ bridge });

    await service.initialize();
    await service.play();
    await service.destroy();

    expect(bridge.initialize).toHaveBeenCalledOnce();
    expect(bridge.play).toHaveBeenCalledOnce();
    expect(bridge.destroy).toHaveBeenCalledOnce();
  });

  it("delegates playback permission checks and settings", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({ bridge });

    await service.isFloatingWindowEnabled();
    await service.isPlaylistAutoplayEnabled();
    await service.isPlaybackMonitorEnabled();
    await service.openFloatingWindowSettings();
    await service.openPlaylistAutoplaySettings();
    await service.openPlaybackMonitorSettings();

    expect(bridge.isFloatingWindowEnabled).toHaveBeenCalledOnce();
    expect(bridge.isPlaylistAutoplayEnabled).toHaveBeenCalledOnce();
    expect(bridge.isPlaybackMonitorEnabled).toHaveBeenCalledOnce();
    expect(bridge.openFloatingWindowSettings).toHaveBeenCalledOnce();
    expect(bridge.openPlaylistAutoplaySettings).toHaveBeenCalledOnce();
    expect(bridge.openPlaybackMonitorSettings).toHaveBeenCalledOnce();
  });
});

function createBridge(): NeteasePlayerBridge {
  return {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    configureSourceReveal: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    ensureLoggedIn: vi.fn().mockResolvedValue(undefined),
    getCurrentPlaybackMetadata: vi.fn().mockResolvedValue({
      status: "permission_required",
      updated_at_ms: 1
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    isFloatingWindowEnabled: vi.fn().mockResolvedValue({ enabled: false }),
    isPlaylistAutoplayEnabled: vi.fn().mockResolvedValue({ enabled: false }),
    isPlaybackMonitorEnabled: vi.fn().mockResolvedValue({ enabled: false }),
    loadPlaylist: vi.fn().mockResolvedValue(undefined),
    openFloatingWindowSettings: vi.fn().mockResolvedValue(undefined),
    openPlaylistAutoplaySettings: vi.fn().mockResolvedValue(undefined),
    openPlaybackMonitorSettings: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined)
  };
}

function analyticsSession(): ImportSessionResponse {
  return {
    id: "session-1",
    status: "ready_to_play",
    raw_track_count: 5,
    source_playlists: [],
    tracks: [],
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    analytics_results: [
      {
        metric_key: "overview",
        payload: {
          participant_count: 2,
          raw_track_count: 5,
          unique_track_count: 4,
          shared_track_count: 1
        },
        status: "completed",
        computed_at: "2026-08-27T00:00:00Z"
      },
      {
        metric_key: "top_shared_tracks",
        payload: { tracks: [{ display_title: "共同歌曲" }] },
        status: "completed",
        computed_at: "2026-08-27T00:00:00Z"
      },
      {
        metric_key: "top_artists",
        payload: { artists: [{ artist: "Artist A" }] },
        status: "completed",
        computed_at: "2026-08-27T00:00:00Z"
      }
    ],
    analytics_status: "completed",
    matched_tracks: []
  };
}

function matched(id: string): MatchedTrackItem {
  return track(id, "auto_accepted", `song-${id}`);
}

function needsConfirm(id: string): MatchedTrackItem {
  return track(id, "needs_confirm");
}

function noMatch(id: string): MatchedTrackItem {
  return track(id, "no_match");
}

function track(
  id: string,
  match_status: MatchedTrackItem["match_status"],
  netease_song_id?: string
): MatchedTrackItem {
  return {
    id,
    display_title: `Track ${id}`,
    artists: ["Artist"],
    source_track_ids: [`source-${id}`],
    contributors: [],
    match_status,
    netease_song_id,
    match_confidence: netease_song_id ? 0.95 : 0,
    match_reason: "test",
    candidates: []
  };
}
