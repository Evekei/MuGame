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
    expect(typeof bridge.getCurrentPlaybackMetadata).toBe("function");
    expect(typeof bridge.initialize).toBe("function");
    expect(typeof bridge.isPlaylistAutoplayEnabled).toBe("function");
    expect(typeof bridge.isPlaybackMonitorEnabled).toBe("function");
    expect(typeof bridge.loadPlaylist).toBe("function");
    expect(typeof bridge.openPlaylistAutoplaySettings).toBe("function");
    expect(typeof bridge.openPlaybackMonitorSettings).toBe("function");
    expect(typeof bridge.play).toBe("function");
  });

  it("reports native_unavailable in plain browser tests", async () => {
    const bridge = getNeteasePlayerBridge();

    await expect(bridge.initialize()).rejects.toMatchObject({
      code: "native_unavailable"
    } satisfies Partial<NeteasePlayerBridgeError>);
  });

  it("returns unsupported metadata in plain browser tests", async () => {
    const bridge = getNeteasePlayerBridge();

    await expect(bridge.getCurrentPlaybackMetadata()).resolves.toMatchObject({
      status: "unsupported",
      updated_at_ms: expect.any(Number)
    });
  });
});
