"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { previewPlaylists } from "@/features/playlist-import/importPreviewService";
import { playlistImportErrorMessage } from "@/features/playlist-import/playlistImportErrors";
import {
  hydrateImportFlowState,
  setImportFlowState,
  useImportFlowStore
} from "./importFlowStore";
import { ImportHistoryPanel } from "./ImportHistoryPanel";

export function ImportPage() {
  const router = useRouter();
  const flow = useImportFlowStore();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    hydrateImportFlowState();
  }, []);

  async function identifyPlaylists() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await previewPlaylists(flow.rawShareText);
      setImportFlowState({
        importTrackLimit: undefined,
        previewItems: response.items,
        readyPayload: undefined,
        session: undefined,
        sessionId: undefined
      });
      setStatus("idle");
      router.push("/confirm");
    } catch (error) {
      setStatus("error");
      setMessage(playlistImportErrorMessage(error));
    }
  }

  return (
    <main className="content flow-page">
      <section className="page-intro">
        <h1>导入歌单</h1>
        <p>粘贴网易云或 QQ 音乐分享链接，可以一次多行。</p>
      </section>

      <section className="import-panel" aria-label="导入歌单链接">
        <label className="share-input-label" htmlFor="share-links">
          歌单分享内容
        </label>
        <textarea
          id="share-links"
          onChange={(event) =>
            setImportFlowState({
              previewItems: [],
              rawShareText: event.target.value,
              readyPayload: undefined,
              session: undefined,
              sessionId: undefined
            })
          }
          placeholder="粘贴歌单分享文案或链接"
          rows={7}
          value={flow.rawShareText}
        />
        <button
          className="primary-action"
          disabled={status === "loading" || flow.rawShareText.trim().length === 0}
          onClick={() => void identifyPlaylists()}
          type="button"
        >
          {status === "loading" ? "识别中" : "识别歌单"}
        </button>
        {flow.previewItems.length > 0 ? (
          <a className="text-link" href="/confirm">
            查看上次识别结果
          </a>
        ) : null}
        {status === "error" ? <p className="account-error">{message}</p> : null}
      </section>
      <ImportHistoryPanel currentSessionId={flow.sessionId ?? flow.session?.id} />
    </main>
  );
}
