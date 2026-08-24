import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type { PlaybackState, PlayerTrack } from "@mugame/contracts/player";
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
  private playableTracks: PlayerTrack[] = [];
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
    this.playableTracks = playableTracks;
    this.tempPlaylistId = options.tempPlaylistId;
    return {
      playableCount: playableTracks.length,
      skippedCount: tracks.length - playableTracks.length
    };
  }

  async playNext() {
    await this.dependencies.bridge.next();
    return this.currentTrackFromPlayback();
  }

  async playPrevious() {
    await this.dependencies.bridge.previous();
    return this.currentTrackFromPlayback();
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
    this.playableTracks = [];
    this.tempPlaylistId = undefined;
  }

  private async currentTrackFromPlayback() {
    const state = await this.dependencies.bridge.getPlaybackState();
    return this.playableTracks.find(
      (track) => track.netease_song_id === state.currentTrackId
    );
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
