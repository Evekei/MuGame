import type { NeteaseAccountSessionResponse } from "@mugame/contracts/account";
import { Capacitor } from "@capacitor/core";
import { ApiClientError } from "@/lib/api/client";
import {
  getNeteaseAuthBridge,
  NeteaseAuthBridgeError,
  type NeteaseAuthBridge
} from "@/bridges/NeteaseAuthBridge";
import { accountApi, type AccountApi } from "./accountApi";
import { setAccountState } from "./accountStore";
import type { AccountState } from "./types";

interface AccountServiceDependencies {
  api: AccountApi;
  bridge: NeteaseAuthBridge;
  now: () => string;
}

const defaultDependencies: AccountServiceDependencies = {
  api: accountApi,
  bridge: getNeteaseAuthBridge(),
  now: () => new Date().toISOString()
};

let dependencies = defaultDependencies;

export function configureAccountService(
  nextDependencies: Partial<AccountServiceDependencies>
) {
  dependencies = { ...dependencies, ...nextDependencies };
}

export function resetAccountServiceDependencies() {
  dependencies = defaultDependencies;
}

export async function bootstrapAccountSession() {
  setAccountState({ status: "unknown" });
  await syncNeteaseAccount();
}

export async function loginNetease() {
  console.info(
    "native platform detected",
    Capacitor.isNativePlatform(),
    Capacitor.getPlatform()
  );
  setAccountState({ status: "logging_in" });

  try {
    console.info("bridge login invoked");
    const loginResult = await dependencies.bridge.openLogin();
    if (!loginResult.authenticated) {
      throw new NeteaseAuthBridgeError("login_cancelled", "NetEase login ended.");
    }

    const snapshot = await dependencies.bridge.readSession();
    const session = await dependencies.api.saveSession(snapshot);
    applySessionResponse(session, "网易云登录已过期，请重新登录。");
  } catch (error) {
    console.info("bridge login failed", safeErrorMessage(error));
    setAccountState(toErrorState(error, "网易云登录失败"));
  } finally {
    await closeLoginSafely();
  }
}

export async function syncNeteaseAccount() {
  try {
    const session = await dependencies.api.readSession();
    if (session.status === "logged_out") {
      const restored = await restoreBackendSessionFromNativeBridge();
      if (restored) {
        applySessionResponse(restored);
        return;
      }
    }
    applySessionResponse(session);
  } catch (error) {
    setAccountState(toErrorState(error, "同步登录状态失败"));
  }
}

export async function logoutNetease() {
  setAccountState({ status: "unknown" });
  const [bridgeResult, apiResult] = await Promise.allSettled([
    dependencies.bridge.clearSession(),
    dependencies.api.clearSession()
  ]);

  if (bridgeResult.status === "fulfilled" && apiResult.status === "fulfilled") {
    setAccountState({ status: "logged_out" });
    return;
  }

  setAccountState({
    status: "error",
    errorMessage: "退出登录未完全完成，请重试。"
  });
}

function applySessionResponse(
  session: NeteaseAccountSessionResponse,
  expiredMessage = "登录已过期，请重新登录。"
) {
  if (session.status === "logged_in" && session.profile) {
    setAccountState({
      status: "logged_in",
      profile: {
        userId: session.profile.user_id,
        nickname: session.profile.nickname,
        avatarUrl: session.profile.avatar_url ?? ""
      },
      lastSyncedAt: dependencies.now()
    });
    return;
  }

  if (session.status === "expired") {
    setAccountState({
      status: "expired",
      errorMessage: expiredMessage,
      lastSyncedAt: dependencies.now()
    });
    return;
  }

  setAccountState({ status: "logged_out", lastSyncedAt: dependencies.now() });
}

function toErrorState(error: unknown, fallback: string): AccountState {
  if (error instanceof NeteaseAuthBridgeError) {
    return { status: "error", errorMessage: bridgeErrorMessage(error) };
  }

  if (error instanceof ApiClientError) {
    return {
      status: "error",
      errorMessage: `${fallback}：${error.message}`
    };
  }

  if (isBridgeErrorLike(error)) {
    return { status: "error", errorMessage: bridgeErrorMessage(error) };
  }

  return { status: "error", errorMessage: fallback };
}

function bridgeErrorMessage(error: {
  code?: string;
  message: string;
}) {
  if (error.code === "native_unavailable") {
    return "请在 Android 或 iOS App 中打开网易云登录。";
  }

  if (error.code === "login_cancelled") {
    return "已取消网易云登录。";
  }

  return error.message;
}

function isBridgeErrorLike(error: unknown): error is {
  code?: string;
  message: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function closeLoginSafely() {
  try {
    await dependencies.bridge.closeLogin();
  } catch {
    // Closing the native login sheet is best-effort after a terminal state.
  }
}

async function restoreBackendSessionFromNativeBridge() {
  if (!Capacitor.isNativePlatform()) {
    return undefined;
  }
  try {
    const snapshot = await dependencies.bridge.readSession();
    return await dependencies.api.saveSession(snapshot);
  } catch {
    return undefined;
  }
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }

  return "unknown";
}
