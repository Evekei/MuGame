import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type { PlaybackState, PlayerTrack } from "@mugame/contracts/player";
import {
  getNeteasePlayerBridge,
  type NeteasePlayerBridge
} from "@/bridges/NeteasePlayerBridge";
import { ShuffleQueue, type RandomSource } from "./ShuffleQueue";

interface NeteasePlayerServiceDependencies {
  bridge: NeteasePlayerBridge;
  random: RandomSource;
}

export interface PlayerSessionSummary {
  playableCount: number;
  skippedCount: number;
}

const defaultDependencies: NeteasePlayerServiceDependencies = {
  bridge: getNeteasePlayerBridge(),
  random: Math.random
};

export class NeteasePlayerService {
  private queue?: ShuffleQueue<PlayerTrack>;

  constructor(private dependencies = defaultDependencies) {}

  async initialize() {
    await this.dependencies.bridge.initialize();
  }

  startSession(tracks: readonly MatchedTrackItem[]): PlayerSessionSummary {
    const playableTracks = toPlayableTracks(tracks);
    this.queue = new ShuffleQueue(playableTracks, this.dependencies.random);
    return {
      playableCount: playableTracks.length,
      skippedCount: tracks.length - playableTracks.length
    };
  }

  async playNext() {
    const track = this.queue?.next();
    if (!track) {
      return undefined;
    }

    await this.playTrack(track);
    return track;
  }

  async playPrevious() {
    const track = this.queue?.previous();
    if (!track) {
      return undefined;
    }

    await this.playTrack(track);
    return track;
  }

  async play() {
    await this.dependencies.bridge.play();
  }

  async pause() {
    await this.dependencies.bridge.pause();
  }

  async seek(ms: number) {
    await this.dependencies.bridge.seek({ ms });
  }

  getPlaybackState(): Promise<PlaybackState> {
    return this.dependencies.bridge.getPlaybackState();
  }

  async destroy() {
    await this.dependencies.bridge.destroy();
    this.queue = undefined;
  }

  private async playTrack(track: PlayerTrack) {
    await this.dependencies.bridge.ensureLoggedIn();
    await this.dependencies.bridge.loadTrack({
      netease_song_id: track.netease_song_id
    });
    await this.dependencies.bridge.play();
  }
}

export function toPlayableTracks(
  tracks: readonly MatchedTrackItem[]
): PlayerTrack[] {
  return tracks
    .filter((track) => Boolean(track.netease_song_id))
    .filter((track) => track.match_status !== "needs_confirm")
    .filter((track) => track.match_status !== "no_match")
    .map((track) => ({
      id: track.id,
      netease_song_id: track.netease_song_id as string,
      display_title: track.display_title,
      artists: track.artists,
      duration_ms: track.duration_ms,
      cover_url: track.cover_url
    }));
}

export const neteasePlayerService = new NeteasePlayerService();
