import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeNavigation } from "./HomeNavigation";

describe("HomeNavigation", () => {
  it("renders the three primary mobile entry points", () => {
    render(<HomeNavigation />);

    expect(screen.getByRole("link", { name: /导入歌单/ })).toHaveAttribute(
      "href",
      "#import"
    );
    expect(screen.getByRole("link", { name: /正在播放\/开始游戏/ })).toHaveAttribute(
      "href",
      "#play"
    );
    expect(screen.getByRole("link", { name: /统计/ })).toHaveAttribute(
      "href",
      "#stats"
    );
  });
});
