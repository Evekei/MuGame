import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type { PlaybackState, PlayerTrack } from "@mugame/contracts/player";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  getActiveLyricLineIndex,
  PlayerPage,
  type PlayerController
} from "./PlayerPage";

describe("PlayerPage", () => {
  it("shows metadata, controls progress, and highlights synced lyrics", async () => {
    const user = userEvent.setup();
    const player = createPlayer({
      state: "playing",
      currentTimeMs: 1500,
      durationMs: 180000,
      currentTrackId: "song-1"
    });
    const lyricsApi = vi.fn().mockResolvedValue({
      track_id: "song-1",
      original_lrc: "",
      parsed_lines: [
        { time_ms: 0, text: "第一句" },
        { time_ms: 1000, text: "第二句", translation: "Second line" }
      ]
    });

    render(<PlayerPage lyricsApi={lyricsApi} player={player} tracks={[matchedTrack()]} />);

    await user.click(screen.getByRole("button", { name: "播放" }));

    expect(await screen.findByText("夜曲")).toBeInTheDocument();
    expect(screen.getByText("周杰伦")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "夜曲 封面" })).toHaveAttribute(
      "src",
      "https://example.test/cover.jpg"
    );
    expect(screen.getByText("Second line")).toBeInTheDocument();
    expect(screen.getByText("第二句").closest("p")).toHaveClass("lyric-line-active");

    fireEvent.change(screen.getByLabelText("播放进度"), {
      target: { value: "42000" }
    });

    expect(player.seek).toHaveBeenLastCalledWith(42000);
  });

  it("keeps playback controls when cover and lyrics fail", async () => {
    const user = userEvent.setup();
    const player = createPlayer();
    const lyricsApi = vi.fn().mockRejectedValue(new Error("lyrics down"));

    render(<PlayerPage lyricsApi={lyricsApi} player={player} tracks={[matchedTrack()]} />);
    await user.click(screen.getByRole("button", { name: "播放" }));
    fireEvent.error(screen.getByRole("img", { name: "夜曲 封面" }));

    expect(await screen.findByText("歌词加载失败，不影响播放。")).toBeInTheDocument();
    expect(within(screen.getByLabelText("播放控制")).getByRole("button", {
      name: "下一首"
    })).toBeEnabled();
  });

  it("shows a friendly empty state when a track has no lyrics", async () => {
    const user = userEvent.setup();
    const lyricsApi = vi.fn().mockResolvedValue({
      track_id: "song-1",
      original_lrc: "",
      parsed_lines: []
    });

    render(
      <PlayerPage lyricsApi={lyricsApi} player={createPlayer()} tracks={[matchedTrack()]} />
    );
    await user.click(screen.getByRole("button", { name: "播放" }));

    expect(await screen.findByText("暂无歌词。")).toBeInTheDocument();
  });

  it("finds the active lyric line from current time", () => {
    expect(
      getActiveLyricLineIndex(
        [
          { time_ms: 0, text: "a" },
          { time_ms: 2000, text: "b" }
        ],
        1500
      )
    ).toBe(0);
  });
});

function createPlayer(playback: PlaybackState = {
  state: "paused",
  currentTimeMs: 0,
  durationMs: 180000
}): PlayerController {
  const track: PlayerTrack = {
    id: "track-1",
    netease_song_id: "song-1",
    display_title: "夜曲",
    artists: ["周杰伦"],
    duration_ms: 180000,
    cover_url: "https://example.test/cover.jpg"
  };
  return {
    destroy: vi.fn().mockResolvedValue(undefined),
    getPlaybackState: vi.fn().mockResolvedValue(playback),
    initialize: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    playNext: vi.fn().mockResolvedValue(track),
    playPrevious: vi.fn().mockResolvedValue(track),
    seek: vi.fn().mockResolvedValue(undefined),
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
    contributors: [],
    match_status: "auto_accepted",
    netease_song_id: "song-1",
    match_confidence: 1,
    match_reason: "test",
    candidates: []
  };
}
