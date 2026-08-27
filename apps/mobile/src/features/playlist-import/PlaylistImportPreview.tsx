"use client";

import type {
  ImportSessionResponse,
  MatchedTrackItem,
  NeteaseTrackCandidate,
  PlaylistPreviewItem
} from "@mugame/contracts/imports";
import { useEffect, useRef, useState } from "react";
import { FullImportProgress } from "./FullImportProgress";
import { MatchReviewPanel } from "./MatchReviewPanel";
import { PlaylistPreviewCard } from "./PlaylistPreviewCard";
import { TempPlaylistSyncPanel } from "./TempPlaylistSyncPanel";
import {
  confirmManualMatch,
  getImportSession,
  previewPlaylists,
  retryFullImport,
  startImportOrchestration
} from "./importPreviewService";
import {
  AnalyticsStatusText,
  matchResultFromSession,
  nextFullImportStatus,
  shouldPollSession,
  tempPlaylistResultFromSession
} from "./importOrchestrationView";
import { playlistImportErrorMessage } from "./playlistImportErrors";

export interface ReadyToPlayPayload {
  tempPlaylistId: string;
  tracks: MatchedTrackItem[];
}

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

interface PlaylistImportPreviewProps {
  onReadyToPlay?: (payload: ReadyToPlayPayload) => void;
  onSessionChange?: (session: ImportSessionResponse) => void;
}

export function PlaylistImportPreview({
  onReadyToPlay,
  onSessionChange
}: PlaylistImportPreviewProps) {
  const [rawText, setRawText] = useState("");
  const readyPlaySessionRef = useRef<string | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewState>({
    status: "idle",
    items: []
  });
  const [fullImport, setFullImport] = useState<FullImportState>({ status: "idle" });
  const readyItems = preview.items.filter((item) => item.preview_status === "ready");
  const canConfirm = readyItems.length > 0 && preview.status !== "loading";

  useEffect(() => {
    if (!fullImport.session || !shouldPollSession(fullImport.session)) {
      return;
    }

    const sessionId = fullImport.session.id;
    const timeoutId = window.setTimeout(() => {
      void refreshImportSession(sessionId);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [fullImport]);

  useEffect(() => {
    const playback = fullImport.session?.playback;
    if (!playback || fullImport.session?.status !== "ready_to_play") {
      return;
    }
    const key = `${fullImport.session.id}:${fullImport.session.ready_to_play_at ?? "ready"}`;
    if (readyPlaySessionRef.current === key) {
      return;
    }
    readyPlaySessionRef.current = key;
    onReadyToPlay?.({
      tempPlaylistId: playback.temp_playlist_id,
      tracks: playback.tracks
    });
  }, [fullImport.session, onReadyToPlay]);

  useEffect(() => {
    if (fullImport.session) {
      onSessionChange?.(fullImport.session);
    }
  }, [fullImport.session, onSessionChange]);

  async function identifyPlaylists(nextText = rawText) {
    setPreview((current) => ({ status: "loading", items: current.items }));

    try {
      const response = await previewPlaylists(nextText);
      setFullImport({ status: "idle" });
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
      const session = await startImportOrchestration(readyItems);
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

  async function confirmCandidate(
    track: MatchedTrackItem,
    candidate: NeteaseTrackCandidate
  ) {
    if (!fullImport.session) {
      return;
    }
    try {
      await confirmManualMatch(fullImport.session.id, {
        source_track_ids: track.source_track_ids,
        netease_song_id: candidate.netease_song_id,
        title: candidate.title,
        artists: candidate.artists,
        album: candidate.album,
        duration_ms: candidate.duration_ms
      });
      await refreshImportSession(fullImport.session.id);
    } catch (error) {
      setFullImport({
        status: "error",
        session: fullImport.session,
        message: playlistImportErrorMessage(error)
      });
    }
  }

  const matchResult = fullImport.session
    ? matchResultFromSession(fullImport.session)
    : undefined;
  const tempPlaylistResult = fullImport.session
    ? tempPlaylistResultFromSession(fullImport.session)
    : undefined;

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
          <AnalyticsStatusText status={fullImport.session.analytics_status} />
        </>
      ) : null}

      {matchResult ? (
        <MatchReviewPanel
          matching={matchResult}
          onConfirm={(track, candidate) => void confirmCandidate(track, candidate)}
        />
      ) : null}

      {tempPlaylistResult ? (
        <TempPlaylistSyncPanel result={tempPlaylistResult} />
      ) : null}
    </div>
  );
}
