import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchJobProgress } from "./MatchJobProgress";

describe("MatchJobProgress", () => {
  it("shows rate limited state without counting it as skipped", () => {
    render(
      <MatchJobProgress
        job={{
          id: "job-1",
          import_session_id: "session-1",
          status: "rate_limited",
          processed_track_count: 9,
          total_track_count: 425,
          auto_matched_count: 9,
          needs_confirm_count: 0,
          no_match_count: 0
        }}
      />
    );

    expect(screen.getByText("网易云限流中")).toBeInTheDocument();
    expect(screen.getByText("9/425")).toBeInTheDocument();
    expect(screen.getByText("自动 9 · 待确认 0 · 跳过 0")).toBeInTheDocument();
  });
});
