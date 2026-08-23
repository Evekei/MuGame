import type {
  ImportSessionResponse,
  TempPlaylistSyncResponse
} from "@mugame/contracts/imports";
import { useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { playlistImportErrorMessage } from "./playlistImportErrors";
import { syncTempPlaylist } from "./importPreviewService";

export type TempPlaylistSyncState =
  | { status: "idle"; result?: undefined; message?: undefined }
  | { status: "loading"; result?: undefined; message?: undefined }
  | { status: "ready"; result: TempPlaylistSyncResponse; message?: undefined }
  | { status: "partial_failed"; result: TempPlaylistSyncResponse; message: string }
  | { status: "auth_expired"; result?: undefined; message: string }
  | { status: "error"; result?: undefined; message: string };

export function useTempPlaylistSync(session: ImportSessionResponse | undefined) {
  const [syncState, setSyncState] = useState<TempPlaylistSyncState>({
    status: "idle"
  });

  async function startSync() {
    if (!session) {
      return;
    }

    setSyncState({ status: "loading" });
    try {
      const result = await syncTempPlaylist(session.id);
      if (result.status === "partial_failed") {
        setSyncState({
          status: "partial_failed",
          result,
          message: "临时歌单同步部分失败，请稍后重试。"
        });
        return;
      }
      setSyncState({ status: "ready", result });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "AUTH_EXPIRED") {
        setSyncState({
          status: "auth_expired",
          message: "网易云登录已过期，请从左上角账号入口重新登录。"
        });
        return;
      }
      setSyncState({ status: "error", message: playlistImportErrorMessage(error) });
    }
  }

  return { startSync, syncState };
}
