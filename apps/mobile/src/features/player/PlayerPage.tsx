"use client";

import type { MatchedTrackItem } from "@mugame/contracts/imports";
import { useEffect, useMemo, useState } from "react";
import {
  neteasePlayerService,
  toPlayableTracks,
  type PlayerSessionSummary
} from "./NeteasePlayerService";

export interface PlayerController {
  destroy: () => Promise<void>;
  initialize: () => Promise<void>;
  play: () => Promise<void>;
  startSession: (
    tracks: readonly MatchedTrackItem[],
    options?: { tempPlaylistId?: string }
  ) => PlayerSessionSummary;
}

interface PlayerPageProps {
  player?: PlayerController;
  tempPlaylistId?: string;
  tracks: MatchedTrackItem[];
}

export function PlayerPage({
  player = neteasePlayerService,
  tempPlaylistId,
  tracks
}: PlayerPageProps) {
  const playableTracks = useMemo(() => toPlayableTracks(tracks), [tracks]);
  const summary = useMemo(() => playableSummary(tracks), [tracks]);
  const [lastError, setLastError] = useState<string>();

  useEffect(() => {
    player.startSession(tracks, { tempPlaylistId });
    void player.initialize().catch(() => {
      setLastError("网易云播放入口初始化失败");
    });
    return () => {
      void player.destroy();
    };
  }, [player, tempPlaylistId, tracks]);

  async function openNetease() {
    setLastError(undefined);
    try {
      await player.play();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "网易云播放入口打开失败");
    }
  }

  return (
    <section className="player-page" aria-label="播放页">
      <div className="netease-player-card">
        <h3>网易云临时歌单已准备</h3>
        <small>
          可播放 {summary.playableCount} 首
          {summary.skippedCount > 0 ? `，跳过 ${summary.skippedCount} 首` : ""}
        </small>
        <button
          className="primary-action netease-open-button"
          disabled={playableTracks.length === 0 || !tempPlaylistId}
          onClick={() => void openNetease()}
          type="button"
        >
          打开网易云播放
        </button>
        <p>封面、歌手、歌词和播放队列以网易云播放页为准。</p>
      </div>

      {lastError ? <p className="account-error">{lastError}</p> : null}
    </section>
  );
}

function playableSummary(tracks: readonly MatchedTrackItem[]): PlayerSessionSummary {
  const playableCount = toPlayableTracks(tracks).length;
  return {
    playableCount,
    skippedCount: tracks.length - playableCount
  };
}
