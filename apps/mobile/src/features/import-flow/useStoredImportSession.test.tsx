import type { ImportSessionResponse } from "@mugame/contracts/imports";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureImportPreviewService,
  resetImportPreviewService
} from "@/features/playlist-import/importPreviewService";
import { resetImportFlowState, setImportFlowState } from "./importFlowStore";
import { useStoredImportSession } from "./useStoredImportSession";

describe("useStoredImportSession", () => {
  beforeEach(() => {
    resetImportFlowState();
    resetImportPreviewService();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps polling when import status stays the same but progress advances", async () => {
    vi.useFakeTimers();
    const getSession = vi
      .fn()
      .mockResolvedValueOnce(importingSession(20))
      .mockResolvedValueOnce(importingSession(27))
      .mockResolvedValueOnce(readySession());
    configureImportPreviewService(mockApi({ getSession }));
    setImportFlowState({
      session: importingSession(20),
      sessionId: "session-1"
    });

    render(<SessionProbe />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(getSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByLabelText("read-progress")).toHaveTextContent("27/27");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByLabelText("session-status")).toHaveTextContent(
      "ready_to_play"
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });
    expect(getSession).toHaveBeenCalledTimes(3);
  });
});

function SessionProbe() {
  const flow = useStoredImportSession({ pollImport: true });
  const read = flow.session?.progress?.read;
  return (
    <div>
      <div aria-label="session-status">{flow.session?.status ?? "none"}</div>
      <div aria-label="read-progress">
        {read ? `${read.current}/${read.total}` : "none"}
      </div>
    </div>
  );
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
    restoreKnownTempPlaylist: vi.fn(),
    restoreTempPlaylist: vi.fn(),
    startFullImport: vi.fn(),
    startMatchJob: vi.fn(),
    startOrchestration: vi.fn(),
    syncTempPlaylist: vi.fn(),
    ...overrides
  };
}

function importingSession(readCount: number): ImportSessionResponse {
  return {
    ...readySession(),
    analytics_status: "pending",
    playback: undefined,
    progress: {
      read: { current: readCount, total: 27 },
      match: { current: 0, total: 27 },
      sync: { current: 0, total: 27 }
    },
    status: "importing"
  };
}

function readySession(): ImportSessionResponse {
  return {
    analytics_results: [],
    analytics_status: "running",
    created_at: "2026-08-27T00:00:00Z",
    id: "session-1",
    matched_tracks: [],
    playback: {
      temp_playlist_id: "temp-1",
      tracks: []
    },
    progress: {
      read: { current: 27, total: 27 },
      match: { current: 1, total: 1 },
      sync: { current: 1, total: 1 }
    },
    raw_track_count: 27,
    source_playlists: [],
    status: "ready_to_play",
    tracks: [],
    updated_at: "2026-08-27T00:00:00Z"
  };
}
