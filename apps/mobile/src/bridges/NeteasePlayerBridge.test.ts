import { describe, expect, it } from "vitest";
import {
  getNeteasePlayerBridge,
  NeteasePlayerBridgeError
} from "./NeteasePlayerBridge";

describe("NeteasePlayerBridge web contract", () => {
  it("exposes the required bridge methods", () => {
    const bridge = getNeteasePlayerBridge();

    expect(typeof bridge.destroy).toBe("function");
    expect(typeof bridge.ensureLoggedIn).toBe("function");
    expect(typeof bridge.getPlaybackState).toBe("function");
    expect(typeof bridge.initialize).toBe("function");
    expect(typeof bridge.loadTrack).toBe("function");
    expect(typeof bridge.pause).toBe("function");
    expect(typeof bridge.play).toBe("function");
    expect(typeof bridge.seek).toBe("function");
  });

  it("reports native_unavailable in plain browser tests", async () => {
    const bridge = getNeteasePlayerBridge();

    await expect(bridge.initialize()).rejects.toMatchObject({
      code: "native_unavailable"
    } satisfies Partial<NeteasePlayerBridgeError>);
  });

  it("returns a diagnostic playback state in web fallback", async () => {
    const bridge = getNeteasePlayerBridge();

    await expect(bridge.getPlaybackState()).resolves.toMatchObject({
      state: "error",
      lastError: expect.stringContaining("Android or iOS")
    });
  });
});
