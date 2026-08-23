import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountApi } from "./accountApi";
import { AccountBootstrap } from "./AccountBootstrap";
import {
  configureAccountService,
  resetAccountServiceDependencies
} from "./accountService";
import { getAccountState, resetAccountState } from "./accountStore";
import type { NeteaseAuthBridge } from "@/bridges/NeteaseAuthBridge";

describe("AccountBootstrap", () => {
  beforeEach(() => {
    resetAccountState();
    resetAccountServiceDependencies();
  });

  it("checks the backend account session on mount", async () => {
    const api: AccountApi = {
      clearSession: vi.fn(),
      readSession: vi.fn().mockResolvedValue({
        status: "logged_out",
        checked_at: "2026-08-23T00:00:00.000Z"
      }),
      saveSession: vi.fn()
    };
    const bridge: NeteaseAuthBridge = {
      clearSession: vi.fn(),
      closeLogin: vi.fn(),
      openLogin: vi.fn(),
      readSession: vi.fn()
    };
    configureAccountService({ api, bridge });

    render(<AccountBootstrap />);

    await waitFor(() => expect(api.readSession).toHaveBeenCalledOnce());
    expect(getAccountState().status).toBe("logged_out");
  });
});
