"use client";

import type {
  ImportSessionResponse,
  PlaylistPreviewItem
} from "@mugame/contracts/imports";
import { useEffect, useState } from "react";
import { FullImportProgress } from "./FullImportProgress";
import { MatchJobProgress } from "./MatchJobProgress";
import { MatchReviewPanel } from "./MatchReviewPanel";
import { PlaylistPreviewCard } from "./PlaylistPreviewCard";
import { TempPlaylistSyncPanel } from "./TempPlaylistSyncPanel";
import {
  getImportSession,
  previewPlaylists,
  retryFullImport,
  startFullImport
} from "./importPreviewService";
import { playlistImportErrorMessage } from "./playlistImportErrors";
import { useImportMatching } from "./useImportMatching";
import { useTempPlaylistSync } from "./useTempPlaylistSync";

type PreviewState =
  | { status: "idle"; items: PlaylistPreviewItem[] }
  | { status: "loading"; items: PlaylistPreviewItem[] }
  | { status: "ready"; items: PlaylistPreviewItem[] }
  | { status: "error"; items: PlaylistPreviewItem[]; message: string };

type FullImportState =
  | { status: "idle"; session?: undefined; message?: undefined }
  | { status: "loading"; session?: ImportSessionResponse; message?: undefined }
  | { status: "ready"; session: ImportSessionResponse; message?: undefined }
  | { status: "error"; session?: ImportSessionResponse; message: string };

export function PlaylistImportPreview() {
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<PreviewState>({
    status: "idle",
    items: []
  });
  const [fullImport, setFullImport] = useState<FullImportState>({ status: "idle" });
  const { confirmCandidate, matching, resetMatching, startMatching } = useImportMatching(
    fullImport.session
  );
  const { startSync, syncState } = useTempPlaylistSync(fullImport.session);
  const readyItems = preview.items.filter((item) => item.preview_status === "ready");
  const canConfirm = readyItems.length > 0 && preview.status !== "loading";
  const canMatch =
    Boolean(fullImport.session) &&
    fullImport.status !== "loading" &&
    matching.status !== "loading";

  useEffect(() => {
    if (fullImport.status !== "loading" || !fullImport.session) {
      return;
    }

    const sessionId = fullImport.session.id;
    const timeoutId = window.setTimeout(() => {
      void refreshImportSession(sessionId);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [fullImport]);

  async function identifyPlaylists(nextText = rawText) {
    setPreview((current) => ({ status: "loading", items: current.items }));

    try {
      const response = await previewPlaylists(nextText);
      setFullImport({ status: "idle" });
      resetMatching();
      setPreview({ status: "ready", items: response.items });
    } catch (error) {
      setPreview((current) => ({
        status: "error",
        items: current.items,
        message: playlistImportErrorMessage(error)
      }));
    }
  }

  function retry(rawRetryText: string) {
    void identifyPlaylists(rawRetryText || rawText);
  }

  async function confirmFullImport() {
    setFullImport({ status: "loading" });

    try {
      const session = await startFullImport(readyItems);
      setFullImport({ status: nextFullImportStatus(session), session });
    } catch (error) {
      setFullImport({ status: "error", message: playlistImportErrorMessage(error) });
    }
  }

  async function refreshImportSession(sessionId: string) {
    try {
      const session = await getImportSession(sessionId);
      setFullImport({ status: nextFullImportStatus(session), session });
    } catch (error) {
      setFullImport((current) => ({
        status: "error",
        session: current.session,
        message: playlistImportErrorMessage(error)
      }));
    }
  }

  async function retryFailedSources() {
    if (!fullImport.session) {
      return;
    }

    setFullImport({ status: "loading", session: fullImport.session });
    try {
      const session = await retryFullImport(fullImport.session.id);
      setFullImport({ status: nextFullImportStatus(session), session });
    } catch (error) {
      setFullImport({
        status: "error",
        session: fullImport.session,
        message: playlistImportErrorMessage(error)
      });
    }
  }

  return (
    <div className="import-preview">
      <label className="share-input-label" htmlFor="share-links">
        歌单分享内容
      </label>
      <textarea
        id="share-links"
        onChange={(event) => setRawText(event.target.value)}
        placeholder="粘贴网易云或 QQ 音乐歌单分享文案，可一次多行"
        rows={5}
        value={rawText}
      />

      <div className="import-actions">
        <button
          className="primary-action"
          disabled={preview.status === "loading" || rawText.trim().length === 0}
          onClick={() => void identifyPlaylists()}
          type="button"
        >
          {preview.status === "loading" ? "识别中" : "识别歌单"}
        </button>
        <button
          className="secondary-action"
          disabled={!canConfirm}
          onClick={() => void confirmFullImport()}
          type="button"
        >
          确认并开始导入
        </button>
      </div>

      {preview.status === "error" ? (
        <p className="account-error">{preview.message}</p>
      ) : null}

      {preview.items.length > 0 ? (
        <div className="preview-list" aria-label="歌单预检结果">
          {preview.items.map((item, index) => (
            <PlaylistPreviewCard
              item={item}
              key={item.canonical_url ?? `failed-${index}`}
              onRetry={retry}
            />
          ))}
        </div>
      ) : null}

      {fullImport.status === "error" ? (
        <p className="account-error">{fullImport.message}</p>
      ) : null}

      {fullImport.session ? (
        <>
          <FullImportProgress
            onRetry={() => void retryFailedSources()}
            session={fullImport.session}
          />
          <button
            className="secondary-action"
            disabled={!canMatch}
            onClick={() => void startMatching()}
            type="button"
          >
            {matching.status === "loading" ? "匹配中" : "匹配网易云歌曲"}
          </button>
        </>
      ) : null}

      {matching.status === "error" || matching.status === "rate_limited" ? (
        <p className="account-error">{matching.message}</p>
      ) : null}

      {matching.status === "loading" || matching.status === "rate_limited" ? (
        <MatchJobProgress job={matching.job} />
      ) : null}

      {matching.result ? (
        <>
          <MatchReviewPanel
            matching={matching.result}
            onConfirm={(track, candidate) => void confirmCandidate(track, candidate)}
          />
          <button
            className="secondary-action"
            disabled={syncState.status === "loading"}
            onClick={() => void startSync()}
            type="button"
          >
            {syncState.status === "loading" ? "同步中" : "同步临时歌单"}
          </button>
        </>
      ) : null}

      {syncState.status === "auth_expired" ||
      syncState.status === "error" ||
      syncState.status === "partial_failed" ? (
        <p className="account-error">{syncState.message}</p>
      ) : null}

      {syncState.result ? <TempPlaylistSyncPanel result={syncState.result} /> : null}
    </div>
  );
}

function nextFullImportStatus(session: ImportSessionResponse) {
  if (session.status === "pending" || session.status === "reading") {
    return "loading";
  }

  return "ready";
}
