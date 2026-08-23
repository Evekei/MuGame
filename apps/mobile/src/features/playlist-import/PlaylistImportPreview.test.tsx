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
    const startFullImport = vi.fn().mockResolvedValue({
      id: "session-1",
      status: "ready",
      raw_track_count: 12,
      created_at: "2026-08-23T00:00:00Z",
      updated_at: "2026-08-23T00:00:01Z",
      tracks: [],
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
    const matchResult = {
      import_session_id: "session-1",
      total_track_count: 1,
      auto_matched_count: 1,
      needs_confirm_count: 0,
      no_match_count: 0,
      tracks: []
    };
    configureImportPreviewService(mockApi({
      getMatchJob: vi.fn().mockResolvedValue({
        id: "job-1",
        import_session_id: "session-1",
        status: "ready",
        processed_track_count: 1,
        total_track_count: 1,
        auto_matched_count: 1,
        needs_confirm_count: 0,
        no_match_count: 0,
        result: matchResult
      }),
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
      startMatchJob: vi.fn().mockResolvedValue({
        id: "job-1",
        import_session_id: "session-1",
        status: "running",
        processed_track_count: 0,
        total_track_count: 1,
        auto_matched_count: 0,
        needs_confirm_count: 0,
        no_match_count: 0
      }),
      startFullImport,
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
    expect(startFullImport).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "匹配网易云歌曲" }));

    expect(await screen.findByLabelText("网易云匹配进度")).toBeInTheDocument();
    expect(await screen.findByLabelText("网易云匹配结果")).toBeInTheDocument();
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
      startFullImport: vi.fn()
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
    getMatchJob: vi.fn(),
    getSession: vi.fn(),
    matchTracks: vi.fn(),
    preview: vi.fn(),
    retryFullImport: vi.fn(),
    startMatchJob: vi.fn(),
    startFullImport: vi.fn(),
    syncTempPlaylist: vi.fn(),
    ...overrides
  };
}
