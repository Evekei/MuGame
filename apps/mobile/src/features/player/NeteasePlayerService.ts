import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type { PlayerTrack } from "@mugame/contracts/player";
import {
  getNeteasePlayerBridge,
  type NeteasePlayerBridge
} from "@/bridges/NeteasePlayerBridge";

interface NeteasePlayerServiceDependencies {
  bridge: NeteasePlayerBridge;
}

export interface PlayerSessionSummary {
  playableCount: number;
  skippedCount: number;
}

interface StartSessionOptions {
  tempPlaylistId?: string;
}

const defaultDependencies: NeteasePlayerServiceDependencies = {
  bridge: getNeteasePlayerBridge()
};

export class NeteasePlayerService {
  private tempPlaylistId?: string;

  constructor(private dependencies = defaultDependencies) {}

  async initialize() {
    await this.dependencies.bridge.initialize();
    if (this.tempPlaylistId) {
      await this.dependencies.bridge.ensureLoggedIn();
      await this.dependencies.bridge.loadPlaylist({
        netease_playlist_id: this.tempPlaylistId
      });
    }
  }

  startSession(
    tracks: readonly MatchedTrackItem[],
    options: StartSessionOptions = {}
  ): PlayerSessionSummary {
    const playableTracks = toPlayableTracks(tracks);
    this.tempPlaylistId = options.tempPlaylistId;
    return {
      playableCount: playableTracks.length,
      skippedCount: tracks.length - playableTracks.length
    };
  }

  async play() {
    await this.dependencies.bridge.play();
  }

  async destroy() {
    await this.dependencies.bridge.destroy();
    this.tempPlaylistId = undefined;
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
      contributors: track.contributors,
      duration_ms: track.duration_ms,
      cover_url: track.cover_url
    }));
}

export const neteasePlayerService = new NeteasePlayerService();
