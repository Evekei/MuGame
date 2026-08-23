import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { resetAccountState } from "@/features/account/accountStore";
import { resetAccountServiceDependencies } from "@/features/account/accountService";

vi.mock("@/components/HealthPanel", () => ({
  HealthPanel: () => <div>Health ready</div>
}));

describe("Home page", () => {
  beforeEach(() => {
    resetAccountState();
    resetAccountServiceDependencies();
  });

  it("keeps AccountEntry as the first clickable item in the top bar", async () => {
    const user = userEvent.setup();
    const { container } = render(<Home />);
    const topbar = screen.getByLabelText("应用顶部栏");
    const accountButton = within(topbar).getByRole("button", { name: /登录/ });

    expect(container.querySelector(".topbar > .account-entry")).toBe(
      accountButton
    );

    await user.click(accountButton);

    expect(screen.getByRole("dialog", { name: "网易云账号" })).toBeInTheDocument();
  });

  it("renders the three primary navigation entries", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: /导入歌单/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /正在播放\/开始游戏/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /统计/ })).toBeInTheDocument();
  });
});
