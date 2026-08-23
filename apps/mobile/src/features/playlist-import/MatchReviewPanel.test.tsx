import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MatchReviewPanel } from "./MatchReviewPanel";

describe("MatchReviewPanel", () => {
  it("shows candidates for manual confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <MatchReviewPanel
        matching={{
          import_session_id: "session-1",
          total_track_count: 1,
          auto_matched_count: 0,
          needs_confirm_count: 1,
          no_match_count: 0,
          tracks: [
            {
              id: "track-1",
              display_title: "源歌曲",
              artists: ["源歌手"],
              source_track_ids: ["qq:1"],
              contributors: [
                {
                  platform: "qq",
                  source_playlist_id: "playlist",
                  owner_source_id: "owner",
                  owner_nickname: "Alice"
                }
              ],
              match_status: "needs_confirm",
              match_confidence: 0.7,
              match_reason: "needs_confirm",
              candidates: [
                {
                  netease_song_id: "100",
                  title: "网易云候选",
                  artists: ["源歌手"],
                  score: 0.7,
                  reason: "title=1"
                }
              ]
            }
          ]
        }}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("源歌曲")).toBeInTheDocument();
    expect(screen.getByText("网易云候选")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /网易云候选/ }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
