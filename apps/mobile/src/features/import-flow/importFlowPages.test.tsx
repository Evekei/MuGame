import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmPage } from "./ConfirmPage";
import { ImportPage } from "./ImportPage";
import { PlayRoutePage } from "./PlayRoutePage";
import { StatsPage } from "./StatsPage";
import {
  getImportFlowState,
  resetImportFlowState,
  setImportFlowState,
  setStoredImportSession
} from "./importFlowStore";
import {
  configureImportPreviewService,
  resetImportPreviewService
} from "@/features/playlist-import/importPreviewService";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace })
}));

vi.mock("@/features/player/PlayerPage", () => ({
  PlayerPage: ({
    onOpenStats,
    onPlaybackOpened
  }: {
    onOpenStats: () => void;
    onPlaybackOpened: () => void;
  }) => (
    <div>
      <button onClick={onPlaybackOpened} type="button">
        打开网易云播放
      </button>
      <button onClick={onOpenStats} type="button">
        打开统计页面
      </button>
    </div>
  )
}));

describe("import flow pages", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    resetImportFlowState();
    resetImportPreviewService();
  });

  it("stores preview results and navigates to confirm after import preview", async () => {
    const user = userEvent.setup();
    configureImportPreviewService(
      mockApi({
        preview: vi.fn().mockResolvedValue({ items: [readyPreviewItem()] })
      })
    );

    render(<ImportPage />);
    await user.type(screen.getByLabelText("歌单分享内容"), "playlist link");
    await user.click(screen.getByRole("button", { name: "识别歌单" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/confirm"));
    expect(getImportFlowState().previewItems).toHaveLength(1);
  });

  it("clears a stale import limit when a new preview is identified", async () => {
    const user = userEvent.setup();
    setImportFlowState({
      importTrackLimit: 20,
      rawShareText: "old link",
      sessionId: "old-session"
    });
    configureImportPreviewService(
      mockApi({
        preview: vi.fn().mockResolvedValue({ items: [readyPreviewItem()] })
      })
    );

    render(<ImportPage />);
    await user.clear(screen.getByLabelText("歌单分享内容"));
    await user.type(screen.getByLabelText("歌单分享内容"), "new playlist link");
    await user.click(screen.getByRole("button", { name: "识别歌单" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/confirm"));
    expect(getImportFlowState().importTrackLimit).toBeUndefined();
    expect(getImportFlowState().sessionId).toBeUndefined();
  });

  it("starts orchestration from confirm and enters play when ready", async () => {
    const user = userEvent.setup();
    const startOrchestration = vi.fn().mockResolvedValue(readySession());
    setImportFlowState({
      previewItems: [readyPreviewItem()],
      rawShareText: "playlist link"
    });
    configureImportPreviewService(
      mockApi({
        getSession: vi.fn().mockResolvedValue(readySession()),
        startOrchestration
      })
    );

    render(<ConfirmPage />);
    await user.type(screen.getByLabelText("每个歌单导入数量"), "40");
    await user.click(screen.getByRole("button", { name: "下一步" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/play"));
    expect(startOrchestration).toHaveBeenCalledWith({
      source_playlists: [
        expect.objectContaining({
          import_track_limit: 40,
          source_playlist_id: "1"
        })
      ]
    });
  });

  it("shows that all tracks will be imported when the limit is blank", () => {
    setImportFlowState({
      previewItems: [readyPreviewItem()],
      rawShareText: "playlist link"
    });
    configureImportPreviewService(mockApi());

    render(<ConfirmPage />);

    expect(screen.getByText("当前设置：导入每个歌单的全部歌曲")).toBeInTheDocument();
  });

  it("shows orchestration progress on the confirm page", async () => {
    const user = userEvent.setup();
    setImportFlowState({ previewItems: [readyPreviewItem()] });
    configureImportPreviewService(
      mockApi({
        getSession: vi.fn().mockResolvedValue(importingSession()),
        startOrchestration: vi.fn().mockResolvedValue(importingSession())
      })
    );

    render(<ConfirmPage />);
    await user.click(screen.getByRole("button", { name: "下一步" }));

    expect(await screen.findByText("已读取 1/3")).toBeInTheDocument();
    expect(screen.getByText("已匹配 0/3")).toBeInTheDocument();
    expect(screen.getByText("已同步 0/3")).toBeInTheDocument();
  });

  it("routes MuGame to stats after playback is opened", async () => {
    const user = userEvent.setup();
    setStoredImportSession(readySession());

    render(<PlayRoutePage />);
    await user.click(screen.getByRole("button", { name: "打开网易云播放" }));

    expect(replace).toHaveBeenCalledWith("/stats");
  });

  it("renders stats tabs and an empty analytics state without a session", () => {
    render(<StatsPage />);

    expect(screen.getByRole("button", { name: "统计总览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最有共鸣歌曲" })).toBeInTheDocument();
    expect(screen.getByText("临时歌单准备好后，统计结果会出现在这里。")).toBeInTheDocument();
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
    preview_status: "ready" as const,
    platform: "netease" as const,
    canonical_url: "https://music.163.com/playlist?id=1",
    source_playlist_id: "1",
    title: "朋友的歌单",
    owner_source_id: "owner-a",
    owner_nickname: "Alice",
    track_count: 3
  };
}

function importingSession() {
  return {
    ...readySession(),
    status: "importing" as const,
    playback: undefined,
    progress: {
      read: { current: 1, total: 3 },
      match: { current: 0, total: 3 },
      sync: { current: 0, total: 3 }
    }
  };
}

function readySession() {
  return {
    id: "session-1",
    status: "ready_to_play" as const,
    raw_track_count: 3,
    source_playlists: [
      {
        ...readyPreviewItem(),
        id: "source-1",
        read_count: 3,
        status: "ready" as const
      }
    ],
    tracks: [],
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    analytics_results: [],
    analytics_status: "running" as const,
    matched_tracks: [matchedTrack()],
    playback: {
      temp_playlist_id: "temp-1",
      tracks: [matchedTrack()]
    },
    progress: {
      read: { current: 3, total: 3 },
      match: { current: 1, total: 1 },
      sync: { current: 1, total: 1 }
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
