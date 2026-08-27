"use client";

import { useEffect } from "react";
import { getImportSession } from "@/features/playlist-import/importPreviewService";
import {
  hydrateImportFlowState,
  setStoredImportSession,
  useImportFlowStore
} from "./importFlowStore";

const POLL_INTERVAL_MS = 1200;
const IMPORT_STATUSES = new Set([
  "pending",
  "reading",
  "importing",
  "normalizing",
  "matching",
  "syncing_temp"
]);

export function useStoredImportSession({
  pollAnalytics = false,
  pollImport = false
}: {
  pollAnalytics?: boolean;
  pollImport?: boolean;
} = {}) {
  const flow = useImportFlowStore();
  const sessionId = flow.sessionId ?? flow.session?.id;
  const session = flow.session;
  const shouldPoll = shouldPollSession(session, { pollAnalytics, pollImport });

  useEffect(() => {
    hydrateImportFlowState();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void getImportSession(sessionId)
      .then(setStoredImportSession)
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !shouldPoll) {
      return;
    }
    let cancelled = false;
    let timeout: number | undefined;

    const scheduleNextPoll = () => {
      timeout = window.setTimeout(() => {
        void getImportSession(sessionId)
          .then((nextSession) => {
            setStoredImportSession(nextSession);
            if (
              !cancelled &&
              shouldPollSession(nextSession, { pollAnalytics, pollImport })
            ) {
              scheduleNextPoll();
            }
          })
          .catch(() => {
            if (!cancelled) {
              scheduleNextPoll();
            }
          });
      }, POLL_INTERVAL_MS);
    };

    scheduleNextPoll();
    return () => {
      cancelled = true;
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [
    pollAnalytics,
    pollImport,
    session?.analytics_status,
    session?.status,
    sessionId,
    shouldPoll
  ]);

  return flow;
}

function shouldPollSession(
  session: { analytics_status?: unknown; status: string } | undefined,
  options: { pollAnalytics: boolean; pollImport: boolean }
) {
  return (
    (options.pollImport && (!session || IMPORT_STATUSES.has(session.status))) ||
    (options.pollAnalytics && isAnalyticsRunning(session?.analytics_status))
  );
}

function isAnalyticsRunning(status: unknown) {
  return status === "pending" || status === "running" || status === "partial";
}
