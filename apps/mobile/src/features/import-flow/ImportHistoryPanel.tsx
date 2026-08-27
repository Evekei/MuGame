"use client";

import type { ImportHistoryItem } from "@mugame/contracts/imports";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deleteImportSession,
  getImportHistory,
  restoreTempPlaylist
} from "@/features/playlist-import/importPreviewService";
import { playlistImportErrorMessage } from "@/features/playlist-import/playlistImportErrors";
import {
  setImportFlowState,
  setStoredImportSession
} from "./importFlowStore";

export function ImportHistoryPanel({
  currentSessionId
}: {
  currentSessionId?: string;
}) {
  const router = useRouter();
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | undefined>();
  const [restoringId, setRestoringId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void getImportHistory()
      .then((items) => {
        if (!cancelled) {
          setHistory(items);
          setStatus("idle");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(playlistImportErrorMessage(error));
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function restoreHistory(item: ImportHistoryItem) {
    setRestoringId(item.session_id);
    setMessage("");
    try {
      const session = await restoreTempPlaylist(item.session_id);
      setStoredImportSession(session);
      router.push("/play");
    } catch (error) {
      setMessage(playlistImportErrorMessage(error));
      setStatus("error");
    } finally {
      setRestoringId(undefined);
    }
  }

  async function deleteHistory(item: ImportHistoryItem) {
    setDeletingId(item.session_id);
    setMessage("");
    try {
      await deleteImportSession(item.session_id);
      setHistory((current) =>
        current.filter((entry) => entry.session_id !== item.session_id)
      );
      if (currentSessionId === item.session_id) {
        setImportFlowState({
          readyPayload: undefined,
          session: undefined,
          sessionId: undefined
        });
      }
    } catch (error) {
      setMessage(playlistImportErrorMessage(error));
      setStatus("error");
    } finally {
      setDeletingId(undefined);
    }
  }

  return (
    <section className="import-panel" aria-label="临时歌单历史">
      <h2>历史记录</h2>
      <p className="form-helper">恢复的是当次随机抽取后的临时歌单游戏。</p>
      {status === "loading" ? <p className="analytics-muted">读取历史中。</p> : null}
      {status !== "loading" && history.length === 0 ? (
        <p className="analytics-muted">暂无临时歌单历史。</p>
      ) : null}
      {history.length > 0 ? (
        <div className="history-list">
          {history.map((item) => (
            <div className="history-row" key={item.session_id}>
              <button
                className="history-card"
                disabled={Boolean(restoringId || deletingId)}
                onClick={() => void restoreHistory(item)}
                type="button"
              >
                <strong>{historyTitle(item)}</strong>
                <span>{historyMeta(item)}</span>
                <span>ID {item.temp_playlist_id}</span>
              </button>
              <button
                className="secondary-action history-delete"
                disabled={Boolean(restoringId || deletingId)}
                onClick={() => void deleteHistory(item)}
                type="button"
              >
                {deletingId === item.session_id ? "删除中" : "删除"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {restoringId ? <p className="import-confirmed">正在恢复临时歌单。</p> : null}
      {status === "error" ? <p className="account-error">{message}</p> : null}
    </section>
  );
}

function historyTitle(item: ImportHistoryItem) {
  const owners = item.owner_nicknames.join("、") || "未知用户";
  return `${formatHistoryDate(item.ready_to_play_at)} · ${owners}`;
}

function historyMeta(item: ImportHistoryItem) {
  const sourceCount = item.source_playlists.length;
  const limit = importLimitText(item);
  return `${item.playable_track_count} 首 · ${sourceCount} 个歌单${limit}`;
}

function importLimitText(item: ImportHistoryItem) {
  const limits = item.source_playlists
    .map((source) => source.import_track_limit)
    .filter((limit): limit is number => typeof limit === "number");
  if (limits.length === 0) {
    return "";
  }
  const uniqueLimits = Array.from(new Set(limits));
  return uniqueLimits.length === 1 ? ` · 每歌单 ${uniqueLimits[0]} 首` : " · 混合抽取";
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
