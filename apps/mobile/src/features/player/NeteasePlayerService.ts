import type { ImportSessionResponse, MatchedTrackItem } from "@mugame/contracts/imports";
import type { FloatingAnalyticsSummary, PlayerTrack } from "@mugame/contracts/player";
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
  analytics?: FloatingAnalyticsSummary;
  tempPlaylistId?: string;
}

const defaultDependencies: NeteasePlayerServiceDependencies = {
  bridge: getNeteasePlayerBridge()
};

export class NeteasePlayerService {
  private analytics?: FloatingAnalyticsSummary;
  private initialized = false;
  private tempPlaylistId?: string;
  private playableTracks: PlayerTrack[] = [];

  constructor(private dependencies = defaultDependencies) {}

  async initialize() {
    await this.dependencies.bridge.initialize();
    this.initialized = true;
    await this.preparePlaylist();
  }

  startSession(
    tracks: readonly MatchedTrackItem[],
    options: StartSessionOptions = {}
  ): PlayerSessionSummary {
    const playableTracks = toPlayableTracks(tracks);
    this.analytics = options.analytics;
    this.playableTracks = playableTracks;
    this.tempPlaylistId = options.tempPlaylistId;
    return {
      playableCount: playableTracks.length,
      skippedCount: tracks.length - playableTracks.length
    };
  }

  async play() {
    if (!this.initialized) {
      await this.dependencies.bridge.initialize();
      this.initialized = true;
    }
    await this.preparePlaylist();
    await this.dependencies.bridge.play();
  }

  async configureAnalytics(analytics: FloatingAnalyticsSummary) {
    this.analytics = analytics;
    await this.dependencies.bridge.configureSourceReveal(this.sourceRevealConfig());
  }

  async isFloatingWindowEnabled() {
    return this.dependencies.bridge.isFloatingWindowEnabled();
  }

  async isPlaylistAutoplayEnabled() {
    return this.dependencies.bridge.isPlaylistAutoplayEnabled();
  }

  async isPlaybackMonitorEnabled() {
    return this.dependencies.bridge.isPlaybackMonitorEnabled();
  }

  async openFloatingWindowSettings() {
    await this.dependencies.bridge.openFloatingWindowSettings();
  }

  async openPlaylistAutoplaySettings() {
    await this.dependencies.bridge.openPlaylistAutoplaySettings();
  }

  async openPlaybackMonitorSettings() {
    await this.dependencies.bridge.openPlaybackMonitorSettings();
  }

  async destroy() {
    await this.dependencies.bridge.destroy();
    this.analytics = undefined;
    this.initialized = false;
    this.tempPlaylistId = undefined;
    this.playableTracks = [];
  }

  private async preparePlaylist() {
    if (!this.tempPlaylistId) {
      return;
    }
    await this.dependencies.bridge.ensureLoggedIn();
    await this.dependencies.bridge.configureSourceReveal(this.sourceRevealConfig());
    await this.dependencies.bridge.loadPlaylist({
      netease_playlist_id: this.tempPlaylistId
    });
  }

  private sourceRevealConfig() {
    const config: { analytics?: FloatingAnalyticsSummary; tracks: PlayerTrack[] } = {
      tracks: this.playableTracks
    };
    if (this.analytics) {
      config.analytics = this.analytics;
    }
    return config;
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

export function toFloatingAnalyticsSummary(
  session: ImportSessionResponse | undefined
): FloatingAnalyticsSummary {
  if (!session) {
    return {
      status: "empty",
      lines: ["统计暂无数据", "完成导入后会显示结果"]
    };
  }
  const status = session.analytics_status ?? "pending";
  const overview = metricPayload(session, "overview");
  if (!overview) {
    return {
      status,
      lines:
        status === "failed"
          ? ["统计分析失败", "回 MuGame 可重试"]
          : ["统计正在分析", "稍后再点统计"]
    };
  }
  const lines = [
    "统计概览",
    `参与 ${numberValue(overview.participant_count)} 人，共 ${numberValue(overview.raw_track_count)} 首`,
    `去重 ${numberValue(overview.unique_track_count)} 首，共同 ${numberValue(overview.shared_track_count)} 首`
  ];
  const topShared = firstTitle(session, "top_shared_tracks", "tracks", "display_title");
  if (topShared) {
    lines.push(`共鸣歌曲：${topShared}`);
  }
  const topArtist = firstTitle(session, "top_artists", "artists", "artist");
  if (topArtist) {
    lines.push(`Top 歌手：${topArtist}`);
  }
  if (status === "pending" || status === "running" || status === "partial") {
    lines.push("其余仍在分析");
  }
  return { status, lines };
}

function metricPayload(session: ImportSessionResponse, key: string) {
  return session.analytics_results.find((metric) => metric.metric_key === key)?.payload;
}

function firstTitle(
  session: ImportSessionResponse,
  metricKey: string,
  listKey: string,
  titleKey: string
) {
  const items = metricPayload(session, metricKey)?.[listKey];
  if (!Array.isArray(items) || !isRecord(items[0])) {
    return "";
  }
  const value = items[0][titleKey];
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const neteasePlayerService = new NeteasePlayerService();
