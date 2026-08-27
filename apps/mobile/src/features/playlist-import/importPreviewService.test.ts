import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureImportPreviewService,
  getMatchJob,
  retryImportAnalytics,
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
});

function mockApi(overrides = {}) {
  return {
    confirmMatch: vi.fn(),
    getMatchJob: vi.fn(),
    getSession: vi.fn(),
    matchTracks: vi.fn(),
    preview: vi.fn(),
    retryAnalytics: vi.fn(),
    retryFullImport: vi.fn(),
    startMatchJob: vi.fn(),
    startFullImport: vi.fn(),
    startOrchestration: vi.fn(),
    syncTempPlaylist: vi.fn(),
    ...overrides
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
