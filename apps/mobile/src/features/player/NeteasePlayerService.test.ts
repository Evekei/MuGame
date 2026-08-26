import type { MatchedTrackItem } from "@mugame/contracts/imports";
import { describe, expect, it, vi } from "vitest";
import type { NeteasePlayerBridge } from "@/bridges/NeteasePlayerBridge";
import { NeteasePlayerService, toPlayableTracks } from "./NeteasePlayerService";

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
