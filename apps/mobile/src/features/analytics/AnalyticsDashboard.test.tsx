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

  it("renders overview by default without showing every section", () => {
    render(<AnalyticsDashboard session={sessionWithMetrics(["overview"])} />);

    const overview = screen.getByLabelText("总览");
    expect(within(overview).getByText("2")).toBeInTheDocument();
    expect(within(overview).getByText("参与人数")).toBeInTheDocument();
    expect(screen.queryByLabelText("你们最有共鸣的歌")).not.toBeInTheDocument();
  });

  it("shows the selected partial module state", () => {
    render(
      <AnalyticsDashboard
        activeSection="albums"
        session={sessionWithMetrics(["overview"], "partial")}
      />
    );

    expect(screen.getByLabelText("专辑与多样性")).toHaveTextContent("分析中");
  });

  it("renders pairwise components without a black-box total score", () => {
    render(<AnalyticsDashboard activeSection="pairwise" session={sessionWithMetrics()} />);

    const pairwise = screen.getByLabelText("两两音乐品味");
    expect(within(pairwise).getByText("Alice vs Bob")).toBeInTheDocument();
    expect(within(pairwise).getByText("歌曲重合度")).toBeInTheDocument();
    expect(within(pairwise).getByText("歌手重合度")).toBeInTheDocument();
    expect(within(pairwise).getByText("曲风相似度")).toBeInTheDocument();
    expect(pairwise).not.toHaveTextContent("综合分");
  });

  it("switches the selected pairwise owner combination", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsDashboard
        activeSection="pairwise"
        session={sessionWithMetrics(undefined, "completed", true)}
      />
    );

    const pairwise = screen.getByLabelText("两两音乐品味");
    await user.selectOptions(within(pairwise).getByLabelText("选择组合"), "alice:cara");

    const selectedPair = pairwise.querySelector(".taste-pair");
    expect(selectedPair).toHaveTextContent("Alice vs Cara");
    expect(within(pairwise).getByText("10%")).toBeInTheDocument();
  });

  it("shows a clear insufficient data message when genre coverage is low", () => {
    render(
      <AnalyticsDashboard activeSection="genres" session={sessionWithLowGenreCoverage()} />
    );

    expect(screen.getByLabelText("Top 曲风 / 共同曲风")).toHaveTextContent(
      "曲风数据不足，结果只供参考。"
    );
  });

  it("shows top artist track details with contributor owners", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard activeSection="topArtists" session={sessionWithMetrics()} />);

    const card = screen.getByLabelText("Top 歌手 / 共同歌手");
    const detailButton = within(card).getByRole("button", { name: "查看详情" });
    expect(within(card).getByText("Artist A")).toBeInTheDocument();
    expect(within(card).getByText("4首")).toBeInTheDocument();
    expect(within(card).queryByText("歌手歌曲一")).not.toBeInTheDocument();
    expect(within(card).queryByText("Alice、Bob")).not.toBeInTheDocument();
    expect(
      within(card).getByText("Artist A").compareDocumentPosition(detailButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await user.click(detailButton);

    expect(within(card).getByText("歌手歌曲一")).toBeInTheDocument();
    expect(within(card).getByText("歌手歌曲四")).toBeInTheDocument();
    expect(within(card).queryByText("歌手歌曲一-Artist A")).not.toBeInTheDocument();
    expect(within(card).getAllByText("Alice、Bob")).toHaveLength(4);
  });

  it("shows shared track details ordered by resonance", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard activeSection="sharedTracks" session={sessionWithMetrics()} />);

    const card = screen.getByLabelText("你们最有共鸣的歌");
    await user.click(within(card).getByRole("button", { name: "查看详情" }));

    expect(within(card).getByText(hasText("共同歌曲-Artist A"))).toBeInTheDocument();
    expect(within(card).getByText("Alice、Bob")).toBeInTheDocument();
  });

  it("shows pairwise overlapping tracks and artists in details", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard activeSection="pairwise" session={sessionWithMetrics()} />);

    const card = screen.getByLabelText("两两音乐品味");
    await user.click(within(card).getByRole("button", { name: "查看详情" }));

    expect(within(card).getByText("重合歌曲")).toBeInTheDocument();
    expect(within(card).getByText(hasText("共同歌曲-Artist A"))).toBeInTheDocument();
    expect(within(card).getByText("Artist A")).toBeInTheDocument();
  });

  it("shows unique artists in unique taste details", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard activeSection="uniqueTaste" session={sessionWithMetrics()} />);

    const card = screen.getByLabelText("独特性");
    await user.click(within(card).getByRole("button", { name: "查看详情" }));

    expect(within(card).getByText("独特歌手")).toBeInTheDocument();
    expect(within(card).getByText("Artist Unique")).toBeInTheDocument();
    expect(within(card).getByText(hasText("独占歌曲-Artist A"))).toBeInTheDocument();
  });

  it("keeps ready cards visible when a failed card is retried", async () => {
    const user = userEvent.setup();
    const retryAnalytics = vi.fn().mockResolvedValue({
      ...sessionWithMetrics(),
      analytics_status: "running"
    });
    configureImportPreviewService(mockApi({ retryAnalytics }));

    render(
      <AnalyticsDashboard
        activeSection="sharedTracks"
        session={sessionWithFailedSharedTracks()}
      />
    );

    const failedCard = screen.getByLabelText("你们最有共鸣的歌");
    await user.click(within(failedCard).getByRole("button", { name: "重试分析" }));

    expect(retryAnalytics).toHaveBeenCalledWith("session-1");
    expect(screen.getByLabelText("你们最有共鸣的歌")).toHaveTextContent("失败");
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
  const trackPairs = includeMultiplePairs
    ? [pair(0.25), pair(0.1, "cara", "Cara")]
    : [pair(0.25)];
  const artistPairs = includeMultiplePairs
    ? [artistPair(0.5), artistPair(0.2, "cara", "Cara")]
    : [artistPair(0.5)];
  const genrePairs = includeMultiplePairs ? [pair(0.75), pair(0.3, "cara", "Cara")] : [pair(0.75)];
  const allMetrics = [
    metric("overview", overviewPayload()),
    metric("top_shared_tracks", { tracks: [sharedTrack()] }),
    metric("pairwise_track_similarity", { pairs: trackPairs }),
    metric("pairwise_artist_similarity", { pairs: artistPairs }),
    metric("pairwise_genre_similarity", { pairs: genrePairs }),
    metric("top_artists", {
      artists: [
        {
          artist: "Artist A",
          artist_key: "artist a",
          participant_count: 2,
          tracks: [
            {
              ...sharedTrack(),
              display_title: "歌手歌曲一"
            },
            {
              ...sharedTrack(),
              display_title: "歌手歌曲二",
              track_id: "track-2"
            },
            {
              ...sharedTrack(),
              display_title: "歌手歌曲三",
              track_id: "track-3"
            },
            {
              ...sharedTrack(),
              display_title: "歌手歌曲四",
              track_id: "track-4"
            }
          ],
          unique_track_count: 4
        }
      ]
    }),
    metric("top_genres", {
      data_coverage: { known_track_count: 2, total_track_count: 3, ratio: 0.67 },
      confidence: { average: 0.8, assignment_count: 2 },
      overall: [{ genre: "pop", share: 0.7 }]
    }),
    metric("shared_genres", { genres: [{ genre: "pop", participant_count: 2, unique_track_count: 2 }] }),
    metric("unique_taste_by_owner", {
      owners: [
        {
          exclusive_artist_count: 1,
          exclusive_artist_ratio: 0.5,
          exclusive_artists: ["Artist Unique"],
          exclusive_track_count: 1,
          exclusive_track_ratio: 0.5,
          exclusive_tracks: [
            {
              ...sharedTrack(),
              contributor_count: 1,
              contributors: [{ owner_source_id: "alice", owner_nickname: "Alice" }],
              display_title: "独占歌曲",
              track_id: "unique-track"
            }
          ],
          owner: { owner_source_id: "alice", owner_nickname: "Alice" },
          total_artist_count: 2,
          total_track_count: 2
        }
      ]
    }),
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
    artists: ["Artist A"],
    contributor_count: 2,
    contributors: [
      { owner_source_id: "alice", owner_nickname: "Alice" },
      { owner_source_id: "bob", owner_nickname: "Bob" }
    ]
  };
}

function hasText(text: string) {
  return (_content: string, element: Element | null) => element?.textContent === text;
}

function pair(jaccard: number, ownerBId = "bob", ownerBName = "Bob") {
  return {
    owner_a: { owner_source_id: "alice", owner_nickname: "Alice" },
    owner_b: { owner_source_id: ownerBId, owner_nickname: ownerBName },
    intersection: 1,
    jaccard,
    shared_tracks: [sharedTrack()],
    union: 4
  };
}

function artistPair(jaccard: number, ownerBId = "bob", ownerBName = "Bob") {
  return {
    owner_a: { owner_source_id: "alice", owner_nickname: "Alice" },
    owner_b: { owner_source_id: ownerBId, owner_nickname: ownerBName },
    intersection: 1,
    jaccard,
    shared_artists: ["Artist A"],
    union: 2
  };
}

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
    restoreTempPlaylist: vi.fn(),
    startMatchJob: vi.fn(),
    startFullImport: vi.fn(),
    startOrchestration: vi.fn(),
    syncTempPlaylist: vi.fn(),
    ...overrides
  };
}
