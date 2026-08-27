import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readLocalImportSession,
  saveLocalImportSession,
  sessionWithTempPlaylistSync
} from "@/features/import-flow/localImportSessionRepository";
import {
  configureImportPreviewService,
  deleteImportSession,
  getImportHistory,
  getMatchJob,
  retryImportAnalytics,
  restoreTempPlaylist,
  startImportOrchestration,
  startFullImport,
  startMatchJob,
  previewPlaylists,
  resetImportPreviewService,
  splitShareText,
  syncTempPlaylist
} from "./importPreviewService";

describe("importPreviewService", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetImportPreviewService();
  });

  it("splits multiple share lines before calling the API", async () => {
    const preview = vi.fn().mockResolvedValue({ items: [] });
    configureImportPreviewService(mockApi({ preview }));

    await previewPlaylists("网易云 https://music.163.com/playlist?id=1\nQQ https://y.qq.com/n/ryqq/playlist/2");

    expect(preview).toHaveBeenCalledWith({
      raw_share_texts: [
        "https://music.163.com/playlist?id=1",
        "https://y.qq.com/n/ryqq/playlist/2"
      ]
    });
  });

  it("drops empty lines", () => {
    expect(splitShareText("\n  a  \n\n b")).toEqual(["a", "b"]);
  });

  it("extracts multiple playlist URLs from one pasted block", () => {
    expect(
      splitShareText(
        "网易云 https://music.163.com/playlist?id=1 QQ https://y.qq.com/n/ryqq/playlist/2"
      )
    ).toEqual([
      "https://music.163.com/playlist?id=1",
      "https://y.qq.com/n/ryqq/playlist/2"
    ]);
  });

  it("splits playlist URLs pasted without separators", () => {
    expect(
      splitShareText(
        "https://music.163.com/playlist?id=1https://y.qq.com/n/ryqq/playlist/2"
      )
    ).toEqual([
      "https://music.163.com/playlist?id=1",
      "https://y.qq.com/n/ryqq/playlist/2"
    ]);
  });

  it("starts full import with ready preview items only", async () => {
    const startFullImportApi = vi.fn().mockResolvedValue({ id: "session-1" });
    configureImportPreviewService(
      mockApi({ startFullImport: startFullImportApi })
    );

    await startFullImport([
      {
        platform: "netease",
        canonical_url: "https://music.163.com/playlist?id=1",
        source_playlist_id: "1",
        title: "Alice 的歌单",
        owner_source_id: "owner-a",
        owner_nickname: "Alice",
        preview_status: "ready"
      },
      {
        preview_status: "failed",
        error: { code: "bad", message: "Bad link" }
      }
    ]);

    expect(startFullImportApi).toHaveBeenCalledWith({
      source_playlists: [
        {
          platform: "netease",
          canonical_url: "https://music.163.com/playlist?id=1",
          source_playlist_id: "1",
          title: "Alice 的歌单",
          owner_source_id: "owner-a",
          owner_nickname: "Alice",
          owner_avatar_url: undefined,
          cover_url: undefined,
          source_tags: [],
          track_count: undefined
        }
      ]
    });
  });

  it("starts orchestration with ready preview items only", async () => {
    const startOrchestrationApi = vi.fn().mockResolvedValue({ id: "session-1" });
    configureImportPreviewService(
      mockApi({ startOrchestration: startOrchestrationApi })
    );

    await startImportOrchestration([
      {
        platform: "netease",
        canonical_url: "https://music.163.com/playlist?id=1",
        source_playlist_id: "1",
        title: "Alice 的歌单",
        owner_source_id: "owner-a",
        owner_nickname: "Alice",
        preview_status: "ready"
      },
      {
        preview_status: "failed",
        error: { code: "bad", message: "Bad link" }
      }
    ]);

    expect(startOrchestrationApi).toHaveBeenCalledWith({
      source_playlists: [
        {
          platform: "netease",
          canonical_url: "https://music.163.com/playlist?id=1",
          source_playlist_id: "1",
          title: "Alice 的歌单",
          owner_source_id: "owner-a",
          owner_nickname: "Alice",
          owner_avatar_url: undefined,
          cover_url: undefined,
          source_tags: [],
          track_count: undefined
        }
      ]
    });
  });

  it("adds a unified import track limit when orchestration starts", async () => {
    const startOrchestrationApi = vi.fn().mockResolvedValue({ id: "session-1" });
    configureImportPreviewService(
      mockApi({ startOrchestration: startOrchestrationApi })
    );

    await startImportOrchestration([readyPreviewItem()], {
      importTrackLimit: 40
    });

    expect(startOrchestrationApi).toHaveBeenCalledWith({
      source_playlists: [
        expect.objectContaining({
          import_track_limit: 40,
          source_playlist_id: "1"
        })
      ]
    });
  });

  it("omits the import track limit when it is not set", async () => {
    const startOrchestrationApi = vi.fn().mockResolvedValue({ id: "session-1" });
    configureImportPreviewService(
      mockApi({ startOrchestration: startOrchestrationApi })
    );

    await startImportOrchestration([readyPreviewItem()]);

    expect(startOrchestrationApi).toHaveBeenCalledWith({
      source_playlists: [
        expect.not.objectContaining({
          import_track_limit: expect.any(Number)
        })
      ]
    });
  });

  it("starts and reads match jobs through the API layer", async () => {
    const startMatchJobApi = vi.fn().mockResolvedValue({ id: "job-1" });
    const getMatchJobApi = vi.fn().mockResolvedValue({ id: "job-1", status: "ready" });
    configureImportPreviewService(
      mockApi({ getMatchJob: getMatchJobApi, startMatchJob: startMatchJobApi })
    );

    await startMatchJob("session-1");
    await getMatchJob("job-1");

    expect(startMatchJobApi).toHaveBeenCalledWith("session-1");
    expect(getMatchJobApi).toHaveBeenCalledWith("job-1");
  });

  it("syncs the current temporary playlist through the API layer", async () => {
    const syncTempPlaylistApi = vi.fn().mockResolvedValue({ temp_playlist_id: "temp-1" });
    configureImportPreviewService(
      mockApi({ syncTempPlaylist: syncTempPlaylistApi })
    );

    await syncTempPlaylist("session-1");

    expect(syncTempPlaylistApi).toHaveBeenCalledWith("session-1");
  });

  it("retries analytics through the API layer", async () => {
    const retryAnalyticsApi = vi.fn().mockResolvedValue({ id: "session-1" });
    configureImportPreviewService(
      mockApi({ retryAnalytics: retryAnalyticsApi })
    );

    await retryImportAnalytics("session-1");

    expect(retryAnalyticsApi).toHaveBeenCalledWith("session-1");
  });

  it("reads import history through the API layer", async () => {
    const getHistoryApi = vi.fn().mockResolvedValue([{ session_id: "session-1" }]);
    configureImportPreviewService(mockApi({ getHistory: getHistoryApi }));

    await getImportHistory(10);

    expect(getHistoryApi).toHaveBeenCalledWith(10);
  });

  it("reads local history before the API when a ready session is saved", async () => {
    const getHistoryApi = vi.fn();
    configureImportPreviewService(mockApi({ getHistory: getHistoryApi }));
    await saveLocalImportSession(readySession());

    const history = await getImportHistory(10);

    expect(getHistoryApi).not.toHaveBeenCalled();
    expect(history[0]?.session_id).toBe("session-1");
  });

  it("restores a historical temp playlist through the API layer", async () => {
    const restoreTempPlaylistApi = vi.fn().mockResolvedValue({ id: "session-1" });
    configureImportPreviewService(
      mockApi({ restoreTempPlaylist: restoreTempPlaylistApi })
    );

    await restoreTempPlaylist("session-1");

    expect(restoreTempPlaylistApi).toHaveBeenCalledWith("session-1");
  });

  it("restores local history by syncing known NetEase song ids", async () => {
    const restoreKnownTempPlaylist = vi.fn().mockResolvedValue({
      batches: [],
      failed_count: 0,
      import_session_id: "session-1",
      ready_at: "2026-08-28T00:00:00Z",
      skipped_count: 0,
      status: "ready",
      synced_count: 1,
      temp_playlist_id: "temp-2"
    });
    const restoreTempPlaylistApi = vi.fn();
    configureImportPreviewService(
      mockApi({ restoreKnownTempPlaylist, restoreTempPlaylist: restoreTempPlaylistApi })
    );
    await saveLocalImportSession(readySession());

    const restored = await restoreTempPlaylist("session-1");

    expect(restoreTempPlaylistApi).not.toHaveBeenCalled();
    expect(restoreKnownTempPlaylist).toHaveBeenCalledWith({
      import_session_id: "session-1",
      netease_song_ids: ["song-1"]
    });
    expect(restored).toEqual(
      sessionWithTempPlaylistSync(readySession(), {
        batches: [],
        failed_count: 0,
        import_session_id: "session-1",
        ready_at: "2026-08-28T00:00:00Z",
        skipped_count: 0,
        status: "ready",
        synced_count: 1,
        temp_playlist_id: "temp-2"
      })
    );
  });

  it("deletes an import session through the API layer", async () => {
    const deleteImportSessionApi = vi.fn().mockResolvedValue({
      deleted: true,
      session_id: "session-1"
    });
    configureImportPreviewService(
      mockApi({ deleteImportSession: deleteImportSessionApi })
    );

    await deleteImportSession("session-1");

    expect(deleteImportSessionApi).toHaveBeenCalledWith("session-1");
  });

  it("deletes local history without calling the server", async () => {
    const deleteImportSessionApi = vi.fn();
    configureImportPreviewService(mockApi({ deleteImportSession: deleteImportSessionApi }));
    await saveLocalImportSession(readySession());

    await deleteImportSession("session-1");

    expect(deleteImportSessionApi).not.toHaveBeenCalled();
    expect(await readLocalImportSession("session-1")).toBeUndefined();
  });
});

function mockApi(overrides = {}) {
  return {
    confirmMatch: vi.fn(),
    deleteImportSession: vi.fn(),
    getHistory: vi.fn(),
    getMatchJob: vi.fn(),
    getSession: vi.fn(),
    matchTracks: vi.fn(),
    preview: vi.fn(),
    retryAnalytics: vi.fn(),
    retryFullImport: vi.fn(),
    restoreKnownTempPlaylist: vi.fn(),
    restoreTempPlaylist: vi.fn(),
    startMatchJob: vi.fn(),
    startFullImport: vi.fn(),
    startOrchestration: vi.fn(),
    syncTempPlaylist: vi.fn(),
    ...overrides
  };
}

function readySession() {
  return {
    id: "session-1",
    status: "ready_to_play" as const,
    raw_track_count: 1,
    source_playlists: [
      {
        ...readyPreviewItem(),
        id: "source-1",
        read_count: 1,
        status: "ready" as const
      }
    ],
    tracks: [],
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    analytics_results: [],
    matched_tracks: [matchedTrack()],
    playback: {
      temp_playlist_id: "temp-1",
      tracks: [matchedTrack()]
    },
    ready_to_play_at: "2026-08-27T00:00:00Z",
    temp_playlist_id: "temp-1"
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

function readyPreviewItem() {
  return {
    platform: "netease" as const,
    canonical_url: "https://music.163.com/playlist?id=1",
    source_playlist_id: "1",
    title: "Alice 的歌单",
    owner_source_id: "owner-a",
    owner_nickname: "Alice",
    preview_status: "ready" as const
  };
}
