import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountEntry } from "./AccountEntry";
import { resetAccountState, setAccountState } from "./accountStore";

describe("AccountEntry", () => {
  beforeEach(() => {
    resetAccountState();
  });

  it("shows the default logged-out entry", () => {
    render(<AccountEntry />);

    expect(screen.getByRole("button", { name: /登录/ })).toBeInTheDocument();
  });

  it("shows nickname when a mock account is logged in", () => {
    setAccountState({
      status: "logged_in",
      profile: { userId: "1", nickname: "Alice", avatarUrl: "" }
    });

    render(<AccountEntry />);

    expect(screen.getByRole("button", { name: /Alice/ })).toBeInTheDocument();
  });

  it("opens the account sheet when tapped", async () => {
    const user = userEvent.setup();
    render(<AccountEntry />);

    await user.click(screen.getByRole("button", { name: /登录/ }));

    expect(screen.getByRole("dialog", { name: "网易云账号" })).toBeInTheDocument();
  });
});
