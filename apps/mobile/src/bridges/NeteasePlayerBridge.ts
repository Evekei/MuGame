"use client";

import type { PlaybackState } from "@mugame/contracts/player";
import { registerPlugin, WebPlugin } from "@capacitor/core";

export type NeteasePlayerBridgeErrorCode =
  | "native_unavailable"
  | "player_not_initialized"
  | "player_action_unsupported"
  | "player_load_failed"
  | "netease_session_expired"
  | "netease_app_open_failed"
  | "media_session_unavailable";

export interface NeteasePlayerBridge {
  destroy: () => Promise<void>;
  ensureLoggedIn: () => Promise<void>;
  getPlaybackState: () => Promise<PlaybackState>;
  initialize: () => Promise<void>;
  loadPlaylist: (options: { netease_playlist_id: string }) => Promise<void>;
  loadTrack: (options: { netease_song_id: string }) => Promise<void>;
  next: () => Promise<void>;
  pause: () => Promise<void>;
  play: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (options: { ms: number }) => Promise<void>;
}

export class NeteasePlayerBridgeError extends Error {
  constructor(
    readonly code: NeteasePlayerBridgeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "NeteasePlayerBridgeError";
  }
}

class NeteasePlayerWebFallback extends WebPlugin implements NeteasePlayerBridge {
  async destroy() {
    return undefined;
  }

  async ensureLoggedIn() {
    throw nativeUnavailable();
  }

  async getPlaybackState(): Promise<PlaybackState> {
    return {
      state: "error",
      currentTimeMs: 0,
      durationMs: 0,
      lastError: "NetEase player requires the Android or iOS app."
    };
  }

  async initialize() {
    throw nativeUnavailable();
  }

  async loadTrack() {
    throw nativeUnavailable();
  }

  async loadPlaylist() {
    throw nativeUnavailable();
  }

  async next() {
    throw nativeUnavailable();
  }

  async pause() {
    throw nativeUnavailable();
  }

  async play() {
    throw nativeUnavailable();
  }

  async previous() {
    throw nativeUnavailable();
  }

  async seek() {
    throw nativeUnavailable();
  }
}

function nativeUnavailable() {
  return new NeteasePlayerBridgeError(
    "native_unavailable",
    "NetEase player requires the Android or iOS app."
  );
}

const nativeBridge = registerPlugin<NeteasePlayerBridge>("NeteasePlayer", {
  web: () => new NeteasePlayerWebFallback()
});

export function getNeteasePlayerBridge() {
  return nativeBridge;
}
