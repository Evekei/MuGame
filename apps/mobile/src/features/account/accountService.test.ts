import { beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import type { AccountApi } from "./accountApi";
import {
  bootstrapAccountSession,
  configureAccountService,
  loginNetease,
  logoutNetease,
  resetAccountServiceDependencies,
  syncNeteaseAccount
} from "./accountService";
import { getAccountState, resetAccountState } from "./accountStore";
import {
  NeteaseAuthBridgeError,
  type NeteaseAuthBridge
} from "@/bridges/NeteaseAuthBridge";

const sessionSnapshot = {
  cookies: [{ name: "MUSIC_U", value: "secret-cookie" }],
  captured_at: "2026-08-23T00:00:00.000Z"
};

const loggedInSession = {
  status: "logged_in" as const,
  profile: {
    user_id: "42",
    nickname: "Netease Alice",
    avatar_url: "https://example.test/avatar.png"
  },
  checked_at: "2026-08-23T00:00:00.000Z"
};

function createFakes() {
  const bridge: NeteaseAuthBridge = {
    clearSession: vi.fn().mockResolvedValue(undefined),
    closeLogin: vi.fn().mockResolvedValue(undefined),
    openLogin: vi.fn().mockResolvedValue({ authenticated: true }),
    readSession: vi.fn().mockResolvedValue(sessionSnapshot)
  };
  const api: AccountApi = {
    clearSession: vi.fn().mockResolvedValue({
      status: "logged_out",
      checked_at: "2026-08-23T00:00:00.000Z"
    }),
    readSession: vi.fn().mockResolvedValue(loggedInSession),
    saveSession: vi.fn().mockResolvedValue(loggedInSession)
  };
  configureAccountService({
    api,
    bridge,
    now: () => "2026-08-23T00:00:00.000Z"
  });
  return { api, bridge };
}

describe("accountService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAccountState();
    resetAccountServiceDependencies();
  });

  it("logs in through the native bridge and backend session API", async () => {
    const { api, bridge } = createFakes();

    await loginNetease();

    expect(bridge.openLogin).toHaveBeenCalledOnce();
    expect(bridge.readSession).toHaveBeenCalledOnce();
    expect(api.saveSession).toHaveBeenCalledWith(sessionSnapshot);
    expect(getAccountState()).toMatchObject({
      status: "logged_in",
      profile: { userId: "42", nickname: "Netease Alice" }
    });
  });

  it("shows native unavailable in a plain browser environment", async () => {
    createFakes();
    configureAccountService({
      bridge: {
        clearSession: vi.fn().mockResolvedValue(undefined),
        closeLogin: vi.fn().mockResolvedValue(undefined),
        openLogin: vi
          .fn()
          .mockRejectedValue(
            new NeteaseAuthBridgeError("native_unavailable", "Native only")
          ),
        readSession: vi.fn()
      }
    });

    await loginNetease();

    expect(getAccountState()).toMatchObject({
      status: "error",
      errorMessage: "请在 Android 或 iOS App 中打开网易云登录。"
    });
  });

  it("restores logged_in on app bootstrap when backend session is valid", async () => {
    createFakes();

    await bootstrapAccountSession();

    expect(getAccountState().status).toBe("logged_in");
  });

  it("marks expired when the backend session is no longer valid", async () => {
    const { api } = createFakes();
    vi.mocked(api.readSession).mockResolvedValue({
      status: "expired",
      checked_at: "2026-08-23T00:00:00.000Z"
    });

    await syncNeteaseAccount();

    expect(getAccountState()).toMatchObject({
      status: "expired",
      errorMessage: "登录已过期，请重新登录。"
    });
  });

  it("restores backend session from native bridge when server is stateless", async () => {
    const { api, bridge } = createFakes();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.mocked(api.readSession).mockResolvedValue({
      status: "logged_out",
      checked_at: "2026-08-23T00:00:00.000Z"
    });

    await syncNeteaseAccount();

    expect(bridge.readSession).toHaveBeenCalledOnce();
    expect(api.saveSession).toHaveBeenCalledWith(sessionSnapshot);
    expect(getAccountState()).toMatchObject({
      status: "logged_in",
      profile: { userId: "42", nickname: "Netease Alice" }
    });
  });

  it("clears both native and backend sessions on logout", async () => {
    const { api, bridge } = createFakes();

    await logoutNetease();

    expect(bridge.clearSession).toHaveBeenCalledOnce();
    expect(api.clearSession).toHaveBeenCalledOnce();
    expect(getAccountState().status).toBe("logged_out");
  });
});
