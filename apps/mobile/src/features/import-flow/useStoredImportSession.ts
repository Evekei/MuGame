"use client";

import { useEffect } from "react";
import { getImportSession } from "@/features/playlist-import/importPreviewService";
import {
  setStoredImportSession,
  useImportFlowStore
} from "./importFlowStore";

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
  const shouldPoll =
    Boolean(sessionId) &&
    ((pollImport && (!session || IMPORT_STATUSES.has(session.status))) ||
      (pollAnalytics && isAnalyticsRunning(session?.analytics_status)));

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
    const timeout = window.setTimeout(() => {
      void getImportSession(sessionId)
        .then(setStoredImportSession)
        .catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [sessionId, shouldPoll, session?.status, session?.analytics_status]);

  return flow;
}

function isAnalyticsRunning(status: unknown) {
  return status === "pending" || status === "running" || status === "partial";
}
