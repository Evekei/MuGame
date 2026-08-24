import type { MatchedTrackItem } from "@mugame/contracts/imports";
import { describe, expect, it, vi } from "vitest";
import type { NeteasePlayerBridge } from "@/bridges/NeteasePlayerBridge";
import { NeteasePlayerService, toPlayableTracks } from "./NeteasePlayerService";

describe("NeteasePlayerService", () => {
  it("builds a playable queue from matched NetEase tracks only", () => {
    expect(toPlayableTracks([matched("1"), needsConfirm("2"), noMatch("3")])).toEqual([
      {
        id: "1",
        netease_song_id: "song-1",
        display_title: "Track 1",
        artists: ["Artist"]
      }
    ]);
  });

  it("loads and plays the next shuffled track through the bridge", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({
      bridge,
      random: () => 0
    });

    service.startSession([matched("1"), matched("2")]);
    const track = await service.playNext();

    expect(bridge.ensureLoggedIn).toHaveBeenCalledOnce();
    expect(bridge.loadTrack).toHaveBeenCalledWith({ netease_song_id: "song-2" });
    expect(bridge.play).toHaveBeenCalledOnce();
    expect(track?.id).toBe("2");
  });

  it("plays previous from history without asking native for randomness", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({
      bridge,
      random: () => 0
    });

    service.startSession([matched("1"), matched("2")]);
    await service.playNext();
    await service.playNext();
    const previous = await service.playPrevious();

    expect(previous?.id).toBe("2");
    expect(bridge.loadTrack).toHaveBeenLastCalledWith({
      netease_song_id: "song-2"
    });
  });

  it("delegates playback controls to the bridge", async () => {
    const bridge = createBridge();
    const service = new NeteasePlayerService({ bridge, random: Math.random });

    await service.initialize();
    await service.pause();
    await service.seek(42_000);
    await service.destroy();

    expect(bridge.initialize).toHaveBeenCalledOnce();
    expect(bridge.pause).toHaveBeenCalledOnce();
    expect(bridge.seek).toHaveBeenCalledWith({ ms: 42_000 });
    expect(bridge.destroy).toHaveBeenCalledOnce();
  });
});

function createBridge(): NeteasePlayerBridge {
  return {
    destroy: vi.fn().mockResolvedValue(undefined),
    ensureLoggedIn: vi.fn().mockResolvedValue(undefined),
    getPlaybackState: vi.fn().mockResolvedValue({
      state: "idle",
      currentTimeMs: 0,
      durationMs: 0
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadTrack: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined)
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
