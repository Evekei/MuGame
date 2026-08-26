"use client";

import type { NeteasePlaybackMetadata } from "@mugame/contracts/player";
import { registerPlugin, WebPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NeteasePlayerBridgeErrorCode =
  | "native_unavailable"
  | "player_not_initialized"
  | "player_action_unsupported"
  | "player_load_failed"
  | "netease_session_expired"
  | "netease_app_open_failed"
  | "media_session_unavailable";

export interface NeteasePlayerBridge {
  addListener: (
    eventName: "neteasePlaybackMetadataChanged",
    listenerFunc: (metadata: NeteasePlaybackMetadata) => void
  ) => Promise<PluginListenerHandle>;
  destroy: () => Promise<void>;
  ensureLoggedIn: () => Promise<void>;
  getCurrentPlaybackMetadata: () => Promise<NeteasePlaybackMetadata>;
  initialize: () => Promise<void>;
  isPlaylistAutoplayEnabled: () => Promise<{ enabled: boolean }>;
  isPlaybackMonitorEnabled: () => Promise<{ enabled: boolean }>;
  loadPlaylist: (options: { netease_playlist_id: string }) => Promise<void>;
  openPlaylistAutoplaySettings: () => Promise<void>;
  openPlaybackMonitorSettings: () => Promise<void>;
  play: () => Promise<void>;
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

  async getCurrentPlaybackMetadata(): Promise<NeteasePlaybackMetadata> {
    return {
      status: "unsupported",
      updated_at_ms: Date.now()
    };
  }

  async initialize() {
    throw nativeUnavailable();
  }

  async isPlaylistAutoplayEnabled() {
    return { enabled: false };
  }

  async isPlaybackMonitorEnabled() {
    return { enabled: false };
  }

  async loadPlaylist() {
    throw nativeUnavailable();
  }

  async openPlaybackMonitorSettings() {
    throw nativeUnavailable();
  }

  async openPlaylistAutoplaySettings() {
    throw nativeUnavailable();
  }

  async play() {
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
