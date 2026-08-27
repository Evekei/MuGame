import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsEntry } from "./SettingsEntry";
import { resetThemeState } from "./themeStore";

describe("SettingsEntry", () => {
  beforeEach(() => {
    resetThemeState();
  });

  it("persists theme changes from the settings sheet", async () => {
    const user = userEvent.setup();
    render(<SettingsEntry />);

    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(screen.getByRole("radio", { name: "深色" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("mugame.theme.preference")).toBe("dark");
  });
});
