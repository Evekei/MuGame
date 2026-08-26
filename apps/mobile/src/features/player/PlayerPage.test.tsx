import type { MatchedTrackItem } from "@mugame/contracts/imports";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerPage, type PlayerController } from "./PlayerPage";

describe("PlayerPage", () => {
  it("initializes the NetEase temp playlist and opens NetEase playback", async () => {
    const user = userEvent.setup();
    const player = createPlayer();

    render(<PlayerPage player={player} tempPlaylistId="temp-1" tracks={[matchedTrack()]} />);

    expect(player.startSession).toHaveBeenCalledWith([matchedTrack()], {
      tempPlaylistId: "temp-1"
    });
    expect(player.initialize).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "打开网易云播放" }));

    expect(player.play).toHaveBeenCalledOnce();
  });

  it("does not render app-owned playback metadata, progress, controls, or lyrics", () => {
    render(
      <PlayerPage player={createPlayer()} tempPlaylistId="temp-1" tracks={[matchedTrack()]} />
    );

    expect(screen.queryByRole("img", { name: "夜曲 封面" })).not.toBeInTheDocument();
    expect(screen.queryByText("周杰伦")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("播放进度")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("歌词")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一首" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一首" })).not.toBeInTheDocument();
  });

  it("disables the NetEase entry when there is no temp playlist", () => {
    render(<PlayerPage player={createPlayer()} tracks={[matchedTrack()]} />);

    expect(screen.getByRole("button", { name: "打开网易云播放" })).toBeDisabled();
  });

  it("shows a recoverable error when NetEase cannot be opened", async () => {
    const user = userEvent.setup();
    const player = createPlayer();
    player.play = vi.fn().mockRejectedValue(new Error("NetEase app could not be opened."));

    render(<PlayerPage player={player} tempPlaylistId="temp-1" tracks={[matchedTrack()]} />);

    await user.click(screen.getByRole("button", { name: "打开网易云播放" }));

    expect(await screen.findByText("NetEase app could not be opened.")).toBeInTheDocument();
  });
});

function createPlayer(): PlayerController {
  return {
    destroy: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    startSession: vi.fn().mockReturnValue({ playableCount: 1, skippedCount: 0 })
  };
}

function matchedTrack(): MatchedTrackItem {
  return {
    id: "track-1",
    display_title: "夜曲",
    artists: ["周杰伦"],
    duration_ms: 180000,
    cover_url: "https://example.test/cover.jpg",
    source_track_ids: ["netease:song-1"],
    contributors: [
      {
        platform: "netease",
        source_playlist_id: "playlist-1",
        owner_source_id: "owner-1",
        owner_nickname: "Alice"
      }
    ],
    match_status: "auto_accepted",
    netease_song_id: "song-1",
    match_confidence: 1,
    match_reason: "test",
    candidates: []
  };
}
