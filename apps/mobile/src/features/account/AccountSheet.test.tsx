import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountApi } from "./accountApi";
import { AccountSheet } from "./AccountSheet";
import {
  configureAccountService,
  resetAccountServiceDependencies
} from "./accountService";
import { getAccountState, resetAccountState, setAccountState } from "./accountStore";
import type { NeteaseAuthBridge } from "@/bridges/NeteaseAuthBridge";

const loggedInResponse = {
  status: "logged_in" as const,
  profile: {
    user_id: "100",
    nickname: "Alice",
    avatar_url: ""
  },
  checked_at: "2026-08-23T00:00:00.000Z"
};

const loggedOutResponse = {
  status: "logged_out" as const,
  checked_at: "2026-08-23T00:00:00.000Z"
};

function installAccountFakes() {
  const bridge: NeteaseAuthBridge = {
    clearSession: vi.fn().mockResolvedValue(undefined),
    closeLogin: vi.fn().mockResolvedValue(undefined),
    openLogin: vi.fn().mockResolvedValue({ authenticated: true }),
    readSession: vi.fn().mockResolvedValue({
      cookies: [{ name: "MUSIC_U", value: "secret" }],
      captured_at: "2026-08-23T00:00:00.000Z"
    })
  };
  const api: AccountApi = {
    clearSession: vi.fn().mockResolvedValue(loggedOutResponse),
    readSession: vi.fn().mockResolvedValue(loggedInResponse),
    saveSession: vi.fn().mockResolvedValue(loggedInResponse)
  };
  configureAccountService({
    api,
    bridge,
    now: () => "2026-08-23T00:00:00.000Z"
  });
  return { api, bridge };
}

describe("AccountSheet", () => {
  beforeEach(() => {
    resetAccountState();
    resetAccountServiceDependencies();
  });

  it("renders account actions", () => {
    render(<AccountSheet isOpen onClose={vi.fn()} />);

    expect(screen.getByText("当前账号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步登录状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
  });

  it("shows relogin for a logged-in mock account", () => {
    setAccountState({
      status: "logged_in",
      profile: { userId: "100", nickname: "Alice", avatarUrl: "" }
    });

    render(<AccountSheet isOpen onClose={vi.fn()} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新登录" })).toBeInTheDocument();
  });

  it("shows expired account state", () => {
    setAccountState({
      status: "expired",
      profile: { userId: "100", nickname: "Alice", avatarUrl: "" }
    });

    render(<AccountSheet isOpen onClose={vi.fn()} />);

    expect(screen.getByText("登录已过期")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("shows error account state with message", () => {
    setAccountState({
      status: "error",
      errorMessage: "同步登录状态失败"
    });

    render(<AccountSheet isOpen onClose={vi.fn()} />);

    expect(screen.getByText("账号状态异常")).toBeInTheDocument();
    expect(screen.getByText("同步登录状态失败")).toBeInTheDocument();
  });

  it("does not render password credential fields", () => {
    render(<AccountSheet isOpen onClose={vi.fn()} />);

    expect(screen.queryByLabelText(/密码/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/password/i)).not.toBeInTheDocument();
  });

  it("updates the store through account service actions", async () => {
    const user = userEvent.setup();
    installAccountFakes();
    render(<AccountSheet isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(getAccountState().status).toBe("logged_in");

    await user.click(screen.getByRole("button", { name: "退出登录" }));
    expect(getAccountState().status).toBe("logged_out");
  });

  it("syncs expired state from the account service", async () => {
    const user = userEvent.setup();
    const { api } = installAccountFakes();
    vi.mocked(api.readSession).mockResolvedValue({
      status: "expired",
      checked_at: "2026-08-23T00:00:00.000Z"
    });

    render(<AccountSheet isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "同步登录状态" }));

    expect(screen.getByText("登录已过期")).toBeInTheDocument();
  });
});
