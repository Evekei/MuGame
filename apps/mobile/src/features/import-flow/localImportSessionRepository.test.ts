import { beforeEach, describe, expect, it } from "vitest";
import type { ImportSessionResponse } from "@mugame/contracts/imports";
import {
  deleteLocalImportSession,
  listLocalImportHistory,
  localPlaybackSongIds,
  readLocalImportSession,
  saveLocalImportSession,
  sessionWithTempPlaylistSync
} from "./localImportSessionRepository";

describe("localImportSessionRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists ready sessions as local temp playlist history", async () => {
    await saveLocalImportSession(readySession());

    const history = await listLocalImportHistory();
    const restored = await readLocalImportSession("session-1");

    expect(history).toEqual([
      expect.objectContaining({
        owner_nicknames: ["Alice"],
        playable_track_count: 1,
        session_id: "session-1",
        temp_playlist_id: "temp-1"
      })
    ]);
    expect(restored?.playback?.tracks[0]?.contributors).toHaveLength(1);
  });

  it("does not expose non-ready sessions in history", async () => {
    await saveLocalImportSession({
      ...readySession(),
      id: "session-2",
      status: "matching",
      playback: undefined,
      ready_to_play_at: undefined
    });

    expect(await listLocalImportHistory()).toEqual([]);
  });

  it("deletes a local session", async () => {
    await saveLocalImportSession(readySession());

    await deleteLocalImportSession("session-1");

    expect(await readLocalImportSession("session-1")).toBeUndefined();
    expect(await listLocalImportHistory()).toEqual([]);
  });

  it("builds sync ids from saved playable NetEase tracks only", () => {
    expect(localPlaybackSongIds(readySession())).toEqual(["song-1"]);
  });

  it("updates temp playlist fields without mutating contributors", () => {
    const session = readySession();

    const restored = sessionWithTempPlaylistSync(session, {
      batches: [],
      failed_count: 0,
      import_session_id: "session-1",
      ready_at: "2026-08-28T00:00:00Z",
      skipped_count: 0,
      status: "ready",
      synced_count: 1,
      temp_playlist_id: "temp-2"
    });

    expect(restored.temp_playlist_id).toBe("temp-2");
    expect(restored.playback?.tracks[0]?.contributors).toEqual(
      session.playback?.tracks[0]?.contributors
    );
  });
});

function readySession(): ImportSessionResponse {
  return {
    id: "session-1",
    status: "ready_to_play",
    raw_track_count: 1,
    source_playlists: [
      {
        canonical_url: "https://music.163.com/playlist?id=1",
        id: "source-1",
        owner_nickname: "Alice",
        owner_source_id: "owner-a",
        platform: "netease",
        read_count: 1,
        source_playlist_id: "1",
        status: "ready",
        title: "Alice list"
      }
    ],
    tracks: [],
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:01Z",
    ready_to_play_at: "2026-08-27T00:00:01Z",
    temp_playlist_id: "temp-1",
    analytics_results: [],
    analytics_status: "completed",
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
