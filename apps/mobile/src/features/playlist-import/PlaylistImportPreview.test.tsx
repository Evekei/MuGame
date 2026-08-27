import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureImportPreviewService,
  resetImportPreviewService
} from "./importPreviewService";
import { PlaylistImportPreview } from "./PlaylistImportPreview";

describe("PlaylistImportPreview", () => {
  beforeEach(() => {
    resetImportPreviewService();
  });

  it("renders playlist cards with owner nickname after preview", async () => {
    const user = userEvent.setup();
    const startOrchestration = vi.fn().mockResolvedValue({
      id: "session-1",
      status: "ready_to_play",
      raw_track_count: 12,
      created_at: "2026-08-23T00:00:00Z",
      updated_at: "2026-08-23T00:00:01Z",
      tracks: [],
      analytics_results: [],
      analytics_status: "running",
      matched_tracks: [matchedTrack()],
      playback: {
        temp_playlist_id: "temp-1",
        tracks: [matchedTrack()]
      },
      progress: {
        read: { current: 12, total: 12 },
        match: { current: 1, total: 1 },
        sync: { current: 1, total: 1 }
      },
      source_playlists: [
        {
          id: "source-1",
          platform: "netease",
          canonical_url: "https://music.163.com/playlist?id=123",
          source_playlist_id: "123",
          title: "朋友的歌单",
          owner_source_id: "owner-1",
          owner_nickname: "Alice",
          track_count: 12,
          read_count: 12,
          status: "ready"
        }
      ]
    });
    configureImportPreviewService(mockApi({
      getSession: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        items: [
          {
            platform: "netease",
            canonical_url: "https://music.163.com/playlist?id=123",
            source_playlist_id: "123",
            title: "朋友的歌单",
            owner_source_id: "owner-1",
            owner_nickname: "Alice",
            owner_avatar_url: "",
            cover_url: "http://example.test/cover.jpg",
            track_count: 12,
            preview_status: "ready"
          }
        ]
      }),
      retryFullImport: vi.fn(),
      startOrchestration,
      syncTempPlaylist: vi.fn()
    }));

    render(<PlaylistImportPreview />);
    await user.type(screen.getByLabelText("歌单分享内容"), "link");
    await user.click(screen.getByRole("button", { name: "识别歌单" }));

    const result = screen.getByLabelText("歌单预检结果");
    expect(within(result).getByText("来自：Alice")).toBeInTheDocument();
    expect(within(result).getByRole("img", { name: "朋友的歌单封面" })).toHaveAttribute(
      "src",
      "https://example.test/cover.jpg"
    );
    expect(
      screen.getByRole("button", { name: "确认并开始导入" })
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "确认并开始导入" }));

    expect(screen.getByLabelText("完整导入进度")).toBeInTheDocument();
    expect(screen.getByText("已读取 朋友的歌单")).toBeInTheDocument();
    expect(screen.getByText("12/12")).toBeInTheDocument();
    expect(screen.getByText("已保存 12 条原始歌曲记录。")).toBeInTheDocument();
    expect(screen.getByText("已读取 12/12")).toBeInTheDocument();
    expect(screen.getByText("已匹配 1/1")).toBeInTheDocument();
    expect(screen.getByText("已同步 1/1")).toBeInTheDocument();
    expect(screen.getByText("统计正在分析。")).toBeInTheDocument();
    expect(screen.getByLabelText("网易云匹配结果")).toBeInTheDocument();
    expect(startOrchestration).toHaveBeenCalledOnce();
  });

  it("notifies the player when orchestration is ready to play", async () => {
    const user = userEvent.setup();
    const onReadyToPlay = vi.fn();
    configureImportPreviewService(mockApi({
      preview: vi.fn().mockResolvedValue({
        items: [readyPreviewItem()]
      }),
      startOrchestration: vi.fn().mockResolvedValue({
        id: "session-1",
        status: "ready_to_play",
        raw_track_count: 1,
        created_at: "2026-08-23T00:00:00Z",
        updated_at: "2026-08-23T00:00:01Z",
        tracks: [],
        analytics_results: [],
        matched_tracks: [matchedTrack()],
        ready_to_play_at: "2026-08-23T00:00:02Z",
        playback: {
          temp_playlist_id: "temp-1",
          tracks: [matchedTrack()]
        },
        source_playlists: [readySource()]
      })
    }));

    render(<PlaylistImportPreview onReadyToPlay={onReadyToPlay} />);
    await user.type(screen.getByLabelText("歌单分享内容"), "link");
    await user.click(screen.getByRole("button", { name: "识别歌单" }));
    await user.click(screen.getByRole("button", { name: "确认并开始导入" }));

    expect(onReadyToPlay).toHaveBeenCalledWith({
      tempPlaylistId: "temp-1",
      tracks: [matchedTrack()]
    });
  });

  it("keeps successful cards when another card fails", async () => {
    const user = userEvent.setup();
    configureImportPreviewService(mockApi({
      getSession: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        items: [
          {
            platform: "qq",
            canonical_url: "https://y.qq.com/n/ryqq/playlist/1",
            source_playlist_id: "1",
            title: "QQ 歌单",
            owner_nickname: "Bob",
            track_count: 8,
            preview_status: "ready"
          },
          {
            preview_status: "failed",
            error: { code: "unsupported_platform", message: "Unsupported" }
          }
        ]
      }),
      retryFullImport: vi.fn(),
      startFullImport: vi.fn(),
      startOrchestration: vi.fn()
    }));

    render(<PlaylistImportPreview />);
    await user.type(screen.getByLabelText("歌单分享内容"), "two links");
    await user.click(screen.getByRole("button", { name: "识别歌单" }));

    expect(screen.getByText("来自：Bob")).toBeInTheDocument();
    expect(screen.getByText("识别失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
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

function readyPreviewItem() {
  return {
    platform: "netease",
    canonical_url: "https://music.163.com/playlist?id=123",
    source_playlist_id: "123",
    title: "朋友的歌单",
    owner_source_id: "owner-1",
    owner_nickname: "Alice",
    track_count: 1,
    preview_status: "ready"
  };
}

function readySource() {
  return {
    ...readyPreviewItem(),
    id: "source-1",
    read_count: 1,
    status: "ready"
  };
}

function matchedTrack() {
  return {
    id: "track-1",
    display_title: "共同歌曲",
    artists: ["Artist"],
    source_track_ids: ["netease:101"],
    contributors: [
      {
        platform: "netease",
        source_playlist_id: "123",
        owner_source_id: "owner-1",
        owner_nickname: "Alice"
      }
    ],
    match_status: "auto_accepted",
    netease_song_id: "101",
    match_confidence: 1,
    match_reason: "native_netease_song_id",
    candidates: []
  };
}
