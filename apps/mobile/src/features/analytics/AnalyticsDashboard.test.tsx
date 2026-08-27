import type { ImportSessionResponse } from "@mugame/contracts/imports";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import {
  configureImportPreviewService,
  resetImportPreviewService
} from "@/features/playlist-import/importPreviewService";

describe("AnalyticsDashboard", () => {
  beforeEach(() => {
    resetImportPreviewService();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders completed cards and analyzing placeholders together", () => {
    render(<AnalyticsDashboard session={sessionWithMetrics(["overview"])} />);

    const overview = screen.getByLabelText("总览");
    expect(within(overview).getByText("2")).toBeInTheDocument();
    expect(within(overview).getByText("参与人数")).toBeInTheDocument();
    expect(screen.getByLabelText("你们最有共鸣的歌")).toHaveTextContent("分析中");
  });

  it("shows completed modules while analytics status is partial", () => {
    render(<AnalyticsDashboard session={sessionWithMetrics(["overview"], "partial")} />);

    expect(screen.getByLabelText("总览")).toHaveTextContent("已完成");
    expect(screen.getByLabelText("专辑与多样性")).toHaveTextContent("分析中");
  });

  it("renders pairwise components without a black-box total score", () => {
    render(<AnalyticsDashboard session={sessionWithMetrics()} />);

    const pairwise = screen.getByLabelText("两两音乐品味");
    expect(within(pairwise).getByText("Alice vs Bob")).toBeInTheDocument();
    expect(within(pairwise).getByText("歌曲重合度")).toBeInTheDocument();
    expect(within(pairwise).getByText("歌手重合度")).toBeInTheDocument();
    expect(within(pairwise).getByText("曲风相似度")).toBeInTheDocument();
    expect(pairwise).not.toHaveTextContent("综合分");
  });

  it("switches the selected pairwise owner combination", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard session={sessionWithMetrics(undefined, "completed", true)} />);

    const pairwise = screen.getByLabelText("两两音乐品味");
    await user.selectOptions(within(pairwise).getByLabelText("选择组合"), "alice:cara");

    const selectedPair = pairwise.querySelector(".taste-pair");
    expect(selectedPair).toHaveTextContent("Alice vs Cara");
    expect(within(pairwise).getByText("10%")).toBeInTheDocument();
  });

  it("shows a clear insufficient data message when genre coverage is low", () => {
    render(<AnalyticsDashboard session={sessionWithLowGenreCoverage()} />);

    expect(screen.getByLabelText("Top 曲风 / 共同曲风")).toHaveTextContent(
      "曲风数据不足，结果只供参考。"
    );
  });

  it("keeps ready cards visible when a failed card is retried", async () => {
    const user = userEvent.setup();
    const retryAnalytics = vi.fn().mockResolvedValue({
      ...sessionWithMetrics(),
      analytics_status: "running"
    });
    configureImportPreviewService(mockApi({ retryAnalytics }));

    render(<AnalyticsDashboard session={sessionWithFailedSharedTracks()} />);

    expect(screen.getByLabelText("总览")).toHaveTextContent("已完成");
    const failedCard = screen.getByLabelText("你们最有共鸣的歌");
    await user.click(within(failedCard).getByRole("button", { name: "重试分析" }));

    expect(retryAnalytics).toHaveBeenCalledWith("session-1");
    expect(screen.getByLabelText("总览")).toHaveTextContent("已完成");
  });

  it("stops polling when analytics is completed", async () => {
    vi.useFakeTimers();
    const getSession = vi.fn();
    configureImportPreviewService(mockApi({ getSession }));

    render(<AnalyticsDashboard session={sessionWithMetrics()} />);
    await vi.advanceTimersByTimeAsync(2000);

    expect(getSession).not.toHaveBeenCalled();
  });

  it("polls while analytics is partial", async () => {
    vi.useFakeTimers();
    const getSession = vi.fn().mockResolvedValue(sessionWithMetrics());
    const onSessionChange = vi.fn();
    configureImportPreviewService(mockApi({ getSession }));

    render(
      <AnalyticsDashboard
        onSessionChange={onSessionChange}
        session={sessionWithMetrics(["overview"], "partial")}
      />
    );
    await vi.advanceTimersByTimeAsync(1600);

    expect(getSession).toHaveBeenCalledWith("session-1");
    expect(onSessionChange).toHaveBeenCalled();
  });
});

function sessionWithFailedSharedTracks(): ImportSessionResponse {
  return {
    ...sessionWithMetrics(["overview", "top_shared_tracks"]),
    analytics_results: [
      metric("overview", overviewPayload()),
      { ...metric("top_shared_tracks", {}), status: "failed" }
    ],
    analytics_status: "failed"
  };
}

function sessionWithLowGenreCoverage(): ImportSessionResponse {
  const session = sessionWithMetrics();
  return {
    ...session,
    analytics_results: session.analytics_results.map((metricItem) =>
      metricItem.metric_key === "top_genres"
        ? metric("top_genres", {
            data_coverage: { known_track_count: 1, total_track_count: 4, ratio: 0.25 },
            confidence: { average: 0.8, assignment_count: 1 },
            overall: [{ genre: "pop", share: 1 }]
          })
        : metricItem
    )
  };
}

function sessionWithMetrics(
  keys?: string[],
  analyticsStatus: ImportSessionResponse["analytics_status"] = keys ? "running" : "completed",
  includeMultiplePairs = false
): ImportSessionResponse {
  const trackPairs = includeMultiplePairs ? [pair(0.25), pair(0.1, "cara", "Cara")] : [pair(0.25)];
  const artistPairs = includeMultiplePairs ? [pair(0.5), pair(0.2, "cara", "Cara")] : [pair(0.5)];
  const genrePairs = includeMultiplePairs ? [pair(0.75), pair(0.3, "cara", "Cara")] : [pair(0.75)];
  const allMetrics = [
    metric("overview", overviewPayload()),
    metric("top_shared_tracks", { tracks: [sharedTrack()] }),
    metric("pairwise_track_similarity", { pairs: trackPairs }),
    metric("pairwise_artist_similarity", { pairs: artistPairs }),
    metric("pairwise_genre_similarity", { pairs: genrePairs }),
    metric("top_artists", { artists: [{ artist: "Artist A", unique_track_count: 2, participant_count: 2 }] }),
    metric("top_genres", {
      data_coverage: { known_track_count: 2, total_track_count: 3, ratio: 0.67 },
      confidence: { average: 0.8, assignment_count: 2 },
      overall: [{ genre: "pop", share: 0.7 }]
    }),
    metric("shared_genres", { genres: [{ genre: "pop", participant_count: 2, unique_track_count: 2 }] }),
    metric("unique_taste_by_owner", { owners: [] }),
    metric("top_albums", { data_coverage: { known_track_count: 1, total_track_count: 3, ratio: 0.33 }, albums: [] }),
    metric("shared_albums", { albums: [] }),
    metric("artist_diversity", { overall: { unique_artists: 2, top_artist_share: 0.5, shannon_entropy: 1 } }),
    metric("genre_diversity", { available: true, overall: { shannon_entropy: 0.8 } })
  ];
  return {
    id: "session-1",
    status: "ready_to_play",
    raw_track_count: 4,
    source_playlists: [],
    tracks: [],
    created_at: "2026-08-26T00:00:00Z",
    updated_at: "2026-08-26T00:00:00Z",
    analytics_results: allMetrics.filter((item) => !keys || keys.includes(item.metric_key)),
    analytics_status: analyticsStatus,
    matched_tracks: []
  };
}

function metric(metric_key: string, payload: Record<string, unknown>) {
  return {
    metric_key,
    payload,
    status: "completed",
    computed_at: "2026-08-26T00:00:00Z"
  };
}

function overviewPayload() {
  return {
    participant_count: 2,
    raw_track_count: 4,
    unique_track_count: 3,
    shared_track_count: 1
  };
}

function sharedTrack() {
  return {
    track_id: "track-1",
    display_title: "共同歌曲",
    contributor_count: 2,
    contributors: [
      { owner_source_id: "alice", owner_nickname: "Alice" },
      { owner_source_id: "bob", owner_nickname: "Bob" }
    ]
  };
}

function pair(jaccard: number, ownerBId = "bob", ownerBName = "Bob") {
  return {
    owner_a: { owner_source_id: "alice", owner_nickname: "Alice" },
    owner_b: { owner_source_id: ownerBId, owner_nickname: ownerBName },
    jaccard
  };
}

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
