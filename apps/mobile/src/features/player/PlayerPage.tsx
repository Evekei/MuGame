"use client";

import type { MatchedTrackItem } from "@mugame/contracts/imports";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  neteasePlayerService,
  toPlayableTracks,
  type PlayerSessionSummary
} from "./NeteasePlayerService";

export interface PlayerController {
  destroy: () => Promise<void>;
  initialize: () => Promise<void>;
  isFloatingWindowEnabled: () => Promise<{ enabled: boolean }>;
  isPlaybackMonitorEnabled: () => Promise<{ enabled: boolean }>;
  isPlaylistAutoplayEnabled: () => Promise<{ enabled: boolean }>;
  openFloatingWindowSettings: () => Promise<void>;
  openPlaybackMonitorSettings: () => Promise<void>;
  openPlaylistAutoplaySettings: () => Promise<void>;
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

interface PermissionState {
  floatingWindow: boolean;
  playbackMonitor: boolean;
  playlistAutoplay: boolean;
}

type PermissionKey = keyof PermissionState;

const READY_PERMISSIONS: PermissionState = {
  floatingWindow: true,
  playbackMonitor: true,
  playlistAutoplay: true
};

const PERMISSION_ACTIONS: {
  key: PermissionKey;
  label: string;
  button: string;
}[] = [
  {
    key: "floatingWindow",
    label: "悬浮窗权限用于显示 MuGame Check 小窗",
    button: "开启悬浮窗权限"
  },
  {
    key: "playlistAutoplay",
    label: "无障碍权限用于点击网易云播放全部并进入播放页",
    button: "开启无障碍权限"
  },
  {
    key: "playbackMonitor",
    label: "通知监听权限用于定位网易云当前播放歌曲",
    button: "开启通知监听权限"
  }
];

export function PlayerPage({
  player = neteasePlayerService,
  tempPlaylistId,
  tracks
}: PlayerPageProps) {
  const playableTracks = useMemo(() => toPlayableTracks(tracks), [tracks]);
  const summary = useMemo(() => playableSummary(tracks), [tracks]);
  const [lastError, setLastError] = useState<string>();
  const [permissions, setPermissions] = useState<PermissionState>(READY_PERMISSIONS);

  const refreshPermissions = useCallback(async () => {
    const [floatingWindow, playlistAutoplay, playbackMonitor] = await Promise.all([
      player.isFloatingWindowEnabled(),
      player.isPlaylistAutoplayEnabled(),
      player.isPlaybackMonitorEnabled()
    ]);
    setPermissions({
      floatingWindow: floatingWindow.enabled,
      playlistAutoplay: playlistAutoplay.enabled,
      playbackMonitor: playbackMonitor.enabled
    });
  }, [player]);

  useEffect(() => {
    let active = true;
    player.startSession(tracks, { tempPlaylistId });
    void player
      .initialize()
      .then(() => (active ? refreshPermissions() : undefined))
      .catch(() => {
        setLastError("网易云播放入口初始化失败");
      });
    return () => {
      active = false;
      void player.destroy();
    };
  }, [player, refreshPermissions, tempPlaylistId, tracks]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPermissions();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [refreshPermissions]);

  async function openNetease() {
    setLastError(undefined);
    try {
      await player.play();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "网易云播放入口打开失败");
    }
  }

  async function openFloatingSettings() {
    try {
      await player.openFloatingWindowSettings();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "悬浮窗权限设置打开失败");
    }
  }

  async function openPlaylistAutoplaySettings() {
    try {
      await player.openPlaylistAutoplaySettings();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "无障碍权限设置打开失败");
    }
  }

  async function openPlaybackMonitorSettings() {
    try {
      await player.openPlaybackMonitorSettings();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "通知监听权限设置打开失败");
    }
  }

  async function openPermissionSettings(key: PermissionKey) {
    if (key === "floatingWindow") {
      await openFloatingSettings();
      return;
    }
    if (key === "playlistAutoplay") {
      await openPlaylistAutoplaySettings();
      return;
    }
    await openPlaybackMonitorSettings();
  }

  const missingPermissions = PERMISSION_ACTIONS.filter(({ key }) => !permissions[key]);

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
        {missingPermissions.length > 0 ? (
          <div className="permission-checklist" aria-label="必需权限检查">
            <strong>需要开启权限后再玩</strong>
            {missingPermissions.map((permission) => (
              <div className="permission-checklist-row" key={permission.key}>
                <span>{permission.label}</span>
                <button
                  className="secondary-action"
                  onClick={() => void openPermissionSettings(permission.key)}
                  type="button"
                >
                  {permission.button}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <p>封面、歌手、歌词和播放队列以网易云播放页为准。</p>
        <p>MuGame 小窗会保留 Check，用于查看当前歌曲来源。</p>
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
