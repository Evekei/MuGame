"use client";

import type { MatchedTrackItem } from "@mugame/contracts/imports";
import type {
  LyricLine,
  LyricsResponse,
  PlaybackState,
  PlayerTrack
} from "@mugame/contracts/player";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  neteasePlayerService,
  toPlayableTracks,
  type PlayerSessionSummary
} from "./NeteasePlayerService";
import { getTrackLyrics, type LyricsApi } from "./playerApi";

export interface PlayerController {
  destroy: () => Promise<void>;
  getPlaybackState: () => Promise<PlaybackState>;
  initialize: () => Promise<void>;
  pause: () => Promise<void>;
  play: () => Promise<void>;
  playNext: () => Promise<PlayerTrack | undefined>;
  playPrevious: () => Promise<PlayerTrack | undefined>;
  seek: (ms: number) => Promise<void>;
  startSession: (
    tracks: readonly MatchedTrackItem[],
    options?: { tempPlaylistId?: string }
  ) => PlayerSessionSummary;
}

interface PlayerPageProps {
  lyricsApi?: LyricsApi;
  player?: PlayerController;
  tempPlaylistId?: string;
  tracks: MatchedTrackItem[];
}

const emptyPlayback: PlaybackState = {
  state: "idle",
  currentTimeMs: 0,
  durationMs: 0
};

export function PlayerPage({
  lyricsApi = getTrackLyrics,
  player = neteasePlayerService,
  tempPlaylistId,
  tracks
}: PlayerPageProps) {
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack>();
  const [coverFailed, setCoverFailed] = useState(false);
  const [lyrics, setLyrics] = useState<LyricsResponse>();
  const [lyricsFailed, setLyricsFailed] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState>(emptyPlayback);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const playableTracks = useMemo(() => toPlayableTracks(tracks), [tracks]);
  const summary = useMemo(() => playableSummary(tracks), [tracks]);

  useEffect(() => {
    player.startSession(tracks, { tempPlaylistId });
    void player.initialize().catch(() => {
      setPlayback({
        ...emptyPlayback,
        state: "error",
        lastError: "播放器初始化失败"
      });
    });
    return () => {
      void player.destroy();
    };
  }, [player, tempPlaylistId, tracks]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPlayback();
    }, 1000);
    return () => window.clearInterval(timer);
  });

  useEffect(() => {
    activeLineRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [playback.currentTimeMs, lyrics]);

  async function startOrToggle() {
    if (!currentTrack) {
      await selectTrack(playableTracks[0]);
    }

    try {
      if (playback.state === "playing") {
        await player.pause();
      } else {
        await player.play();
      }
      await refreshAndSelectPlayback();
    } catch (error) {
      setPlayback({
        ...emptyPlayback,
        state: "error",
        lastError: error instanceof Error ? error.message : "播放器控制失败"
      });
    }
  }

  async function playAndSelect(action: () => Promise<PlayerTrack | undefined>) {
    try {
      const nextTrack = await action();
      await selectTrack(nextTrack);
      await refreshAndSelectPlayback();
    } catch (error) {
      setPlayback({
        ...emptyPlayback,
        state: "error",
        lastError: error instanceof Error ? error.message : "播放器控制失败"
      });
    }
  }

  async function selectTrack(nextTrack: PlayerTrack | undefined) {
    if (!nextTrack) {
      return;
    }
    setCurrentTrack(nextTrack);
    setCoverFailed(false);
    await loadLyrics(nextTrack.netease_song_id);
  }

  async function loadLyrics(trackId: string) {
    setLyrics(undefined);
    setLyricsFailed(false);
    try {
      setLyrics(await lyricsApi(trackId));
    } catch {
      setLyricsFailed(true);
    }
  }

  async function refreshPlayback() {
    try {
      setPlayback(await player.getPlaybackState());
    } catch (error) {
      setPlayback({
        ...emptyPlayback,
        state: "error",
        lastError: error instanceof Error ? error.message : "播放器状态读取失败"
      });
    }
  }

  async function refreshAndSelectPlayback() {
    const nextPlayback = await player.getPlaybackState();
    setPlayback(nextPlayback);
    const track = playableTracks.find(
      (item) => item.netease_song_id === nextPlayback.currentTrackId
    );
    if (track) {
      await selectTrack(track);
    }
  }

  async function seekTo(value: string) {
    const ms = Number(value);
    setPlayback((current) => ({ ...current, currentTimeMs: ms }));
    await player.seek(ms);
    await refreshPlayback();
  }

  const activeLineIndex = getActiveLyricLineIndex(
    lyrics?.parsed_lines ?? [],
    playback.currentTimeMs
  );

  return (
    <section className="player-page" aria-label="播放页">
      <div className="player-cover" aria-label="专辑封面">
        {currentTrack?.cover_url && !coverFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${currentTrack.display_title} 封面`}
            onError={() => setCoverFailed(true)}
            src={currentTrack.cover_url}
          />
        ) : (
          <span>{currentTrack ? "MuGame" : "Ready"}</span>
        )}
      </div>

      <div className="player-meta">
        <h3>{currentTrack?.display_title ?? "临时歌单已准备"}</h3>
        <p>{currentTrack?.artists.join(" / ") ?? "点击播放打开网易云临时歌单"}</p>
        {summary ? (
          <small>
            可播放 {summary.playableCount} 首
            {summary.skippedCount > 0 ? `，跳过 ${summary.skippedCount} 首` : ""}
          </small>
        ) : null}
      </div>

      <div className="player-progress">
        <input
          aria-label="播放进度"
          max={playback.durationMs || currentTrack?.duration_ms || 0}
          min={0}
          onChange={(event) => void seekTo(event.currentTarget.value)}
          type="range"
          value={Math.min(playback.currentTimeMs, playback.durationMs || Infinity)}
        />
        <div>
          <span>{formatDuration(playback.currentTimeMs)}</span>
          <span>{formatDuration(playback.durationMs || currentTrack?.duration_ms)}</span>
        </div>
      </div>

      <div className="player-controls" aria-label="播放控制">
        <button onClick={() => void playAndSelect(() => player.playPrevious())} type="button">
          上一首
        </button>
        <button className="player-main-button" onClick={() => void startOrToggle()} type="button">
          {playback.state === "playing" ? "暂停" : "播放"}
        </button>
        <button onClick={() => void playAndSelect(() => player.playNext())} type="button">
          下一首
        </button>
      </div>

      {playback.lastError ? <p className="account-error">{playback.lastError}</p> : null}

      <div className="lyric-panel" aria-label="歌词">
        {lyricsFailed ? <p>歌词加载失败，不影响播放。</p> : null}
        {!lyricsFailed && lyrics?.parsed_lines.length === 0 ? <p>暂无歌词。</p> : null}
        {(lyrics?.parsed_lines ?? []).map((line, index) => (
          <p
            className={index === activeLineIndex ? "lyric-line-active" : undefined}
            key={`${line.time_ms}-${index}`}
            ref={index === activeLineIndex ? activeLineRef : undefined}
          >
            <span>{line.text || "..."}</span>
            {line.translation ? <small>{line.translation}</small> : null}
          </p>
        ))}
      </div>
    </section>
  );
}

export function getActiveLyricLineIndex(lines: LyricLine[], currentTimeMs: number) {
  return lines.reduce((activeIndex, line, index) => {
    if (line.time_ms <= currentTimeMs) {
      return index;
    }
    return activeIndex;
  }, -1);
}

function formatDuration(value: number | undefined) {
  const totalSeconds = Math.max(0, Math.floor((value ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function playableSummary(tracks: readonly MatchedTrackItem[]): PlayerSessionSummary {
  const playableCount = toPlayableTracks(tracks).length;
  return {
    playableCount,
    skippedCount: tracks.length - playableCount
  };
}
