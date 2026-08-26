import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type { NeteasePlaybackMetadata } from "@mugame/contracts/player";

export type CurrentTrackLocateResult =
  | { status: "matched"; track: MatchedTrackItem; confidence: number; reason: string }
  | { status: "ambiguous"; candidates: MatchedTrackItem[]; reason: string }
  | { status: "unknown"; reason: string };

const DURATION_TOLERANCE_MS = 5000;

export function locateCurrentTrack(
  metadata: NeteasePlaybackMetadata,
  tracks: readonly MatchedTrackItem[]
): CurrentTrackLocateResult {
  if (metadata.status !== "ready") {
    return { status: "unknown", reason: metadata.status };
  }

  const byMediaId = locateByMediaId(metadata, tracks);
  if (byMediaId) {
    return byMediaId;
  }

  const title = normalizeText(metadata.title);
  const artists = normalizeArtists(metadata.artist);
  if (!title || artists.length === 0) {
    return { status: "unknown", reason: "metadata_incomplete" };
  }

  const candidates = tracks
    .map((track) => ({
      track,
      score: scoreTrack(metadata, title, artists, track)
    }))
    .filter((candidate) => candidate.score >= 0.82)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return { status: "unknown", reason: "no_matching_track" };
  }

  const best = candidates[0];
  const tied = candidates.filter((candidate) => best.score - candidate.score < 0.04);
  if (tied.length > 1) {
    return {
      status: "ambiguous",
      candidates: tied.map((candidate) => candidate.track),
      reason: "multiple_tracks_match_metadata"
    };
  }

  return {
    status: "matched",
    track: best.track,
    confidence: best.score,
    reason: "metadata_title_artist_match"
  };
}

function locateByMediaId(
  metadata: NeteasePlaybackMetadata,
  tracks: readonly MatchedTrackItem[]
): CurrentTrackLocateResult | undefined {
  const mediaId = metadata.media_id?.trim();
  if (!mediaId) {
    return undefined;
  }

  const matches = tracks.filter((track) => track.netease_song_id === mediaId);
  if (matches.length === 1) {
    return {
      status: "matched",
      track: matches[0],
      confidence: 1,
      reason: "metadata_media_id_match"
    };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      candidates: matches,
      reason: "multiple_tracks_match_media_id"
    };
  }
  return undefined;
}

function scoreTrack(
  metadata: NeteasePlaybackMetadata,
  metadataTitle: string,
  metadataArtists: string[],
  track: MatchedTrackItem
) {
  let score = normalizeText(track.display_title) === metadataTitle ? 0.62 : 0;
  score += artistOverlap(metadataArtists, track.artists) * 0.28;

  if (metadata.duration_ms && track.duration_ms) {
    score += durationsMatch(metadata.duration_ms, track.duration_ms) ? 0.08 : -0.08;
  }

  if (metadata.album && track.album && normalizeText(metadata.album) === normalizeText(track.album)) {
    score += 0.02;
  }

  return Math.max(0, Math.min(1, score));
}

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[《》"'`.,，。:：()[\]（）【】]/g, "");
}

function normalizeArtists(value: string | undefined) {
  return (value ?? "")
    .split(/[\/,，、&＆;；]/)
    .map(normalizeText)
    .filter(Boolean);
}

function artistOverlap(metadataArtists: string[], trackArtists: readonly string[]) {
  const source = new Set(metadataArtists);
  const target = new Set(trackArtists.map(normalizeText).filter(Boolean));
  if (source.size === 0 || target.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const artist of source) {
    if (target.has(artist)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(source.size, target.size);
}

function durationsMatch(left: number, right: number) {
  return Math.abs(left - right) <= DURATION_TOLERANCE_MS;
}
