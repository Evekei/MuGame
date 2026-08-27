"use client";

import type {
  MatchedTrackItem,
  NeteaseTrackCandidate
} from "@mugame/contracts/imports";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FullImportProgress } from "@/features/playlist-import/FullImportProgress";
import { MatchReviewPanel } from "@/features/playlist-import/MatchReviewPanel";
import { PlaylistPreviewCard } from "@/features/playlist-import/PlaylistPreviewCard";
import {
  confirmManualMatch,
  getImportSession,
  retryFullImport,
  startImportOrchestration
} from "@/features/playlist-import/importPreviewService";
import {
  AnalyticsStatusText,
  matchResultFromSession
} from "@/features/playlist-import/importOrchestrationView";
import { playlistImportErrorMessage } from "@/features/playlist-import/playlistImportErrors";
import {
  setImportFlowState,
  setStoredImportSession
} from "./importFlowStore";
import { useStoredImportSession } from "./useStoredImportSession";

export function ConfirmPage() {
  const router = useRouter();
  const flow = useStoredImportSession({ pollImport: true });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const pushedReadyRef = useRef(false);
  const readyItems = flow.previewItems.filter(
    (item) => item.preview_status === "ready"
  );
  const canStart = readyItems.length > 0 && status !== "loading";
  const matchResult = flow.session ? matchResultFromSession(flow.session) : undefined;

  useEffect(() => {
    if (flow.session?.status !== "ready_to_play" || pushedReadyRef.current) {
      return;
    }
    pushedReadyRef.current = true;
    router.push("/play");
  }, [flow.session?.status, router]);

  async function startImport() {
    setStatus("loading");
    setMessage("");
    try {
      const session = await startImportOrchestration(flow.previewItems, {
        importTrackLimit: flow.importTrackLimit
      });
      setStoredImportSession(session);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(playlistImportErrorMessage(error));
    }
  }

  async function retryFailedStage() {
    if (!flow.session) {
      return;
    }
    setStatus("loading");
    try {
      setStoredImportSession(await retryFullImport(flow.session.id));
    } catch (error) {
      setStatus("error");
      setMessage(playlistImportErrorMessage(error));
    }
  }

  async function confirmCandidate(
    track: MatchedTrackItem,
    candidate: NeteaseTrackCandidate
  ) {
    if (!flow.session) {
      return;
    }
    await confirmManualMatch(flow.session.id, {
      source_track_ids: track.source_track_ids,
      netease_song_id: candidate.netease_song_id,
      title: candidate.title,
      artists: candidate.artists,
      album: candidate.album,
      duration_ms: candidate.duration_ms
    });
    setStoredImportSession(await getImportSession(flow.session.id));
  }

  return (
    <main className="content flow-page">
      <a className="back-link" href="/import">
        返回
      </a>
      <section className="page-intro">
        <h1>确认歌单</h1>
        <p>确认来源无误后，设置每个歌单抽取数量，再进入导入。</p>
      </section>

      <section className="import-panel" aria-label="确认导入设置">
        <label className="share-input-label" htmlFor="import-track-limit">
          每个歌单导入数量
        </label>
        <input
          id="import-track-limit"
          inputMode="numeric"
          min={1}
          onChange={(event) => setLimit(event.target.value)}
          placeholder="不填则导入全部"
          type="number"
          value={flow.importTrackLimit ?? ""}
        />
        <p className="form-helper">
          当前设置：
          {flow.importTrackLimit ? `每个歌单随机抽取 ${flow.importTrackLimit} 首` : "导入每个歌单的全部歌曲"}
        </p>
        <button
          className="primary-action"
          disabled={!canStart}
          onClick={() => void startImport()}
          type="button"
        >
          {status === "loading" ? "导入中" : "下一步"}
        </button>
        {status === "error" ? <p className="account-error">{message}</p> : null}
      </section>

      {flow.previewItems.length > 0 ? (
        <section className="preview-list" aria-label="歌单预检结果">
          {flow.previewItems.map((item, index) => (
            <PlaylistPreviewCard
              item={item}
              key={item.canonical_url ?? `failed-${index}`}
              onRetry={(rawText) => {
                setImportFlowState({ rawShareText: rawText });
                router.push("/import");
              }}
            />
          ))}
        </section>
      ) : (
        <section className="empty-panel">
          <p>还没有识别到歌单。</p>
          <a className="text-link" href="/import">
            去导入
          </a>
        </section>
      )}

      {flow.session ? (
        <>
          <FullImportProgress
            onRetry={() => void retryFailedStage()}
            session={flow.session}
          />
          <AnalyticsStatusText status={flow.session.analytics_status} />
        </>
      ) : null}

      {matchResult ? (
        <MatchReviewPanel
          matching={matchResult}
          onConfirm={(track, candidate) => void confirmCandidate(track, candidate)}
        />
      ) : null}
    </main>
  );

  function setLimit(value: string) {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    setImportFlowState({
      importTrackLimit:
        trimmed && Number.isFinite(parsed)
          ? Math.max(1, Math.floor(parsed))
          : undefined
    });
  }
}
