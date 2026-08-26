import type { Contributor } from "@mugame/contracts/imports";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SourceReveal } from "./SourceReveal";

describe("SourceReveal", () => {
  it("hides a single contributor until Check is tapped", async () => {
    const user = userEvent.setup();
    render(<SourceReveal contributors={[contributor("Alice")]} trackId="track-1" />);

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("shows every contributor nickname after reveal", async () => {
    const user = userEvent.setup();
    render(
      <SourceReveal
        contributors={[contributor("Alice"), contributor("Bob"), contributor("Cindy")]}
        trackId="track-1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Cindy")).toBeInTheDocument();
  });

  it("hides contributor nicknames when Hide is tapped", async () => {
    const user = userEvent.setup();
    render(<SourceReveal contributors={[contributor("Alice")]} trackId="track-1" />);

    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check" })).toBeInTheDocument();
  });

  it("resets to hidden when the track changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SourceReveal contributors={[contributor("Alice")]} trackId="track-1" />
    );

    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Alice")).toBeInTheDocument();

    rerender(<SourceReveal contributors={[contributor("Bob")]} trackId="track-2" />);

    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check" })).toBeInTheDocument();
  });

  it("does not mutate contributors while checking and hiding", async () => {
    const user = userEvent.setup();
    const contributors = [contributor("Alice"), contributor("Bob")];
    const before = JSON.stringify(contributors);
    render(<SourceReveal contributors={contributors} trackId="track-1" />);

    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(JSON.stringify(contributors)).toBe(before);
  });
});

function contributor(owner_nickname: string): Contributor {
  return {
    platform: "netease",
    source_playlist_id: `playlist-${owner_nickname}`,
    owner_source_id: `owner-${owner_nickname}`,
    owner_nickname
  };
}
