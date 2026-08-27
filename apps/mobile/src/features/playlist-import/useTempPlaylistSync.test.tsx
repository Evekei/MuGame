import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/client";
import {
  configureImportPreviewService,
  resetImportPreviewService
} from "./importPreviewService";
import { useTempPlaylistSync } from "./useTempPlaylistSync";

describe("useTempPlaylistSync", () => {
  beforeEach(() => {
    resetImportPreviewService();
  });

  it("guides the user to re-login when auth expires", async () => {
    const user = userEvent.setup();
    configureImportPreviewService(
      mockApi({
        syncTempPlaylist: vi
          .fn()
          .mockRejectedValue(new ApiClientError("Expired", 401, "AUTH_EXPIRED"))
      })
    );

    render(<TempSyncProbe />);
    await user.click(screen.getByRole("button", { name: "sync" }));

    expect(await screen.findByText(/左上角账号入口重新登录/)).toBeInTheDocument();
  });
});

function TempSyncProbe() {
  const { startSync, syncState } = useTempPlaylistSync({
    id: "session-1",
    status: "ready",
    raw_track_count: 1,
    source_playlists: [],
    tracks: [],
    analytics_results: [],
    matched_tracks: [],
    created_at: "2026-08-23T00:00:00Z",
    updated_at: "2026-08-23T00:00:00Z"
  });

  return (
    <>
      <button type="button" onClick={() => void startSync()}>
        sync
      </button>
      <p>{syncState.message}</p>
    </>
  );
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
