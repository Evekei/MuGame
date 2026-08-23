"use client";

import type { NeteaseSessionSnapshot } from "@mugame/contracts/account";
import { registerPlugin, WebPlugin } from "@capacitor/core";

export type NeteaseAuthBridgeErrorCode =
  | "native_unavailable"
  | "login_cancelled"
  | "session_unavailable";

export interface NeteaseLoginResult {
  authenticated: boolean;
}

export interface NeteaseAuthBridge {
  clearSession: () => Promise<void>;
  closeLogin: () => Promise<void>;
  openLogin: () => Promise<NeteaseLoginResult>;
  readSession: () => Promise<NeteaseSessionSnapshot>;
}

export class NeteaseAuthBridgeError extends Error {
  constructor(
    readonly code: NeteaseAuthBridgeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "NeteaseAuthBridgeError";
  }
}

class NeteaseAuthWebFallback extends WebPlugin implements NeteaseAuthBridge {
  async clearSession() {
    return undefined;
  }

  async closeLogin() {
    return undefined;
  }

  async openLogin(): Promise<NeteaseLoginResult> {
    throw new NeteaseAuthBridgeError(
      "native_unavailable",
      "NetEase login requires the Android or iOS app."
    );
  }

  async readSession(): Promise<NeteaseSessionSnapshot> {
    throw new NeteaseAuthBridgeError(
      "native_unavailable",
      "NetEase session cookies are only available in the native app."
    );
  }
}

const nativeBridge = registerPlugin<NeteaseAuthBridge>("NeteaseAuth", {
  web: () => new NeteaseAuthWebFallback()
});

export function getNeteaseAuthBridge() {
  return nativeBridge;
}
