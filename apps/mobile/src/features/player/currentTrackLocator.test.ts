import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type { NeteasePlaybackMetadata } from "@mugame/contracts/player";
import { describe, expect, it } from "vitest";
import { locateCurrentTrack } from "./currentTrackLocator";

describe("locateCurrentTrack", () => {
  it("matches by NetEase media id when available", () => {
    const result = locateCurrentTrack(metadata({ media_id: "song-2" }), [
      track("1", "晴天", ["周杰伦"]),
      track("2", "夜曲", ["周杰伦"])
    ]);

    expect(result).toMatchObject({
      status: "matched",
      track: { id: "2" },
      reason: "metadata_media_id_match"
    });
  });

  it("matches by normalized title and artist", () => {
    const result = locateCurrentTrack(
      metadata({ title: " 夜曲 ", artist: "周杰伦" }),
      [track("1", "夜曲", ["周杰伦"])]
    );

    expect(result).toMatchObject({
      status: "matched",
      track: { id: "1" },
      reason: "metadata_title_artist_match"
    });
  });

  it("matches split artists from NetEase metadata", () => {
    const result = locateCurrentTrack(
      metadata({ title: "合唱歌", artist: "Alice/Bob" }),
      [track("1", "合唱歌", ["Alice", "Bob"])]
    );

    expect(result).toMatchObject({ status: "matched", track: { id: "1" } });
  });

  it("uses duration to break version ties", () => {
    const result = locateCurrentTrack(
      metadata({ title: "同名歌", artist: "歌手", duration_ms: 200000 }),
      [
        track("short", "同名歌", ["歌手"], { duration_ms: 180000 }),
        track("right", "同名歌", ["歌手"], { duration_ms: 201000 })
      ]
    );

    expect(result).toMatchObject({ status: "matched", track: { id: "right" } });
  });

  it("returns ambiguous when multiple tracks match equally", () => {
    const result = locateCurrentTrack(
      metadata({ title: "同名歌", artist: "歌手" }),
      [track("a", "同名歌", ["歌手"]), track("b", "同名歌", ["歌手"])]
    );

    expect(result).toMatchObject({
      status: "ambiguous",
      candidates: [{ id: "a" }, { id: "b" }]
    });
  });

  it("returns unknown for incomplete or out-of-session metadata", () => {
    expect(
      locateCurrentTrack(metadata({ title: "别的歌", artist: "别人" }), [
        track("1", "夜曲", ["周杰伦"])
      ])
    ).toMatchObject({ status: "unknown", reason: "no_matching_track" });

    expect(
      locateCurrentTrack(metadata({ status: "permission_required" }), [
        track("1", "夜曲", ["周杰伦"])
      ])
    ).toMatchObject({ status: "unknown", reason: "permission_required" });
  });
});

function metadata(
  overrides: Partial<NeteasePlaybackMetadata> = {}
): NeteasePlaybackMetadata {
  return {
    status: "ready",
    title: "夜曲",
    artist: "周杰伦",
    updated_at_ms: 1,
    ...overrides
  };
}

function track(
  id: string,
  display_title: string,
  artists: string[],
  overrides: Partial<MatchedTrackItem> = {}
): MatchedTrackItem {
  return {
    id,
    display_title,
    artists,
    source_track_ids: [`netease:song-${id}`],
    contributors: [],
    match_status: "auto_accepted",
    netease_song_id: `song-${id}`,
    match_confidence: 1,
    match_reason: "test",
    candidates: [],
    ...overrides
  };
}
