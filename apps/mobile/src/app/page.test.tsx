import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import {
  resetImportFlowState,
  setImportFlowState
} from "@/features/import-flow/importFlowStore";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() })
}));

describe("Home page", () => {
  beforeEach(() => {
    push.mockClear();
    resetImportFlowState();
  });

  it("renders the import route as the first flow page", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "导入歌单" })).toBeInTheDocument();
    expect(screen.getByLabelText("歌单分享内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "识别歌单" })).toBeDisabled();
  });

  it("can link back to the previous preview result", () => {
    setImportFlowState({
      previewItems: [
        {
          preview_status: "ready",
          platform: "netease",
          canonical_url: "https://music.163.com/playlist?id=1",
          source_playlist_id: "1",
          title: "朋友的歌单",
          owner_source_id: "owner-a",
          owner_nickname: "Alice"
        }
      ]
    });

    render(<Home />);

    expect(screen.getByRole("link", { name: "查看上次识别结果" })).toHaveAttribute(
      "href",
      "/confirm"
    );
  });
});
