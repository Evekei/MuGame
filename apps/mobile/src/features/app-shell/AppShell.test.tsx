import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountState } from "@/features/account/accountStore";
import { resetAccountServiceDependencies } from "@/features/account/accountService";
import { resetThemeState } from "@/features/settings/themeStore";
import { AppShell } from "./AppShell";

let pathname = "/confirm";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/confirm";
    resetAccountState();
    resetAccountServiceDependencies();
    resetThemeState();
  });

  it("keeps account and settings in the top bar", async () => {
    const user = userEvent.setup();
    const { container } = render(<AppShell>content</AppShell>);
    const topbar = screen.getByLabelText("应用顶部栏");
    const accountButton = within(topbar).getByRole("button", { name: /登录/ });

    expect(container.querySelector(".topbar-actions > .account-entry")).toBe(
      accountButton
    );
    expect(within(topbar).getByRole("button", { name: "设置" })).toBeInTheDocument();

    await user.click(accountButton);

    expect(screen.getByRole("dialog", { name: "网易云账号" })).toBeInTheDocument();
  });

  it("highlights the current flow step", () => {
    render(<AppShell>content</AppShell>);

    expect(screen.getByRole("link", { name: "确认" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "播放" })).toHaveAttribute(
      "href",
      "/play"
    );
  });
});
