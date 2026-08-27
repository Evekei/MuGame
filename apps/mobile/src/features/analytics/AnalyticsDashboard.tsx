"use client";

import type { ImportSessionResponse } from "@mugame/contracts/imports";
import { useEffect, useMemo, useState } from "react";
import {
  getImportSession,
  retryImportAnalytics
} from "@/features/playlist-import/importPreviewService";
import {
  AlbumsDiversityCard,
  cardMetrics,
  GenresCard,
  groupState,
  LyricKeywordsCard,
  OverviewCard,
  PairwiseTasteCard,
  SharedTracksCard,
  TopArtistsCard,
  UniqueTasteCard
} from "./AnalyticsSections";
import {
  metricMap,
  metricView,
  shouldPollAnalytics
} from "./analyticsStats";

interface AnalyticsDashboardProps {
  activeSection?: AnalyticsSectionKey;
  onSessionChange?: (session: ImportSessionResponse) => void;
  session?: ImportSessionResponse;
}

export type AnalyticsSectionKey =
  | "albums"
  | "genres"
  | "overview"
  | "pairwise"
  | "sharedTracks"
  | "topArtists"
  | "uniqueTaste";

export function AnalyticsDashboard({
  activeSection = "overview",
  onSessionChange,
  session
}: AnalyticsDashboardProps) {
  const [retrying, setRetrying] = useState<string | undefined>();
  const metrics = useMemo(() => metricMap(session), [session]);

  useEffect(() => {
    if (!session?.id || !shouldPollAnalytics(session.analytics_status)) {
      return;
    }
    let cancelled = false;
    let timeout: number | undefined;
    const sessionId = session.id;

    const scheduleNextPoll = () => {
      timeout = window.setTimeout(async () => {
        try {
          const nextSession = await getImportSession(sessionId);
          onSessionChange?.(nextSession);
          if (!cancelled && shouldPollAnalytics(nextSession.analytics_status)) {
            scheduleNextPoll();
          }
        } catch {
          if (!cancelled) {
            scheduleNextPoll();
          }
        }
      }, 1500);
    };

    scheduleNextPoll();
    return () => {
      cancelled = true;
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [onSessionChange, session?.analytics_status, session?.id]);

  if (!session) {
    return (
      <div className="analytics-empty">
        <p>临时歌单准备好后，统计结果会出现在这里。</p>
      </div>
    );
  }
  const currentSession = session;

  async function retryCard(cardKey: string) {
    setRetrying(cardKey);
    try {
      const nextSession = await retryImportAnalytics(currentSession.id);
      onSessionChange?.(nextSession);
    } finally {
      setRetrying(undefined);
    }
  }

  return <div className="analytics-dashboard">{renderActiveSection()}</div>;

  function renderActiveSection() {
    if (activeSection === "sharedTracks") {
      return (
        <SharedTracksCard
          onRetry={() => void retryCard("sharedTracks")}
          state={groupState(
            metrics,
            cardMetrics.sharedTracks,
            currentSession.analytics_status,
            retrying === "sharedTracks"
          )}
          view={metricView(
            metrics,
            "top_shared_tracks",
            currentSession.analytics_status
          )}
        />
      );
    }
    if (activeSection === "topArtists") {
      return (
        <TopArtistsCard
          onRetry={() => void retryCard("topArtists")}
          state={groupState(
            metrics,
            cardMetrics.topArtists,
            currentSession.analytics_status,
            retrying === "topArtists"
          )}
          view={metricView(metrics, "top_artists", currentSession.analytics_status)}
        />
      );
    }
    if (activeSection === "pairwise") {
      return (
        <PairwiseTasteCard
          metrics={metrics}
          onRetry={() => void retryCard("pairwise")}
          session={currentSession}
          state={groupState(
            metrics,
            cardMetrics.pairwise,
            currentSession.analytics_status,
            retrying === "pairwise"
          )}
        />
      );
    }
    if (activeSection === "genres") {
      return (
        <GenresCard
          metrics={metrics}
          onRetry={() => void retryCard("genres")}
          session={currentSession}
          state={groupState(
            metrics,
            cardMetrics.genres,
            currentSession.analytics_status,
            retrying === "genres"
          )}
        />
      );
    }
    if (activeSection === "uniqueTaste") {
      return (
        <UniqueTasteCard
          onRetry={() => void retryCard("uniqueTaste")}
          state={groupState(
            metrics,
            cardMetrics.uniqueTaste,
            currentSession.analytics_status,
            retrying === "uniqueTaste"
          )}
          view={metricView(
            metrics,
            "unique_taste_by_owner",
            currentSession.analytics_status
          )}
        />
      );
    }
    if (activeSection === "albums") {
      return (
        <>
          <AlbumsDiversityCard
            metrics={metrics}
            onRetry={() => void retryCard("albums")}
            session={currentSession}
            state={groupState(
              metrics,
              cardMetrics.albums,
              currentSession.analytics_status,
              retrying === "albums"
            )}
          />
          <LyricKeywordsCard metrics={metrics} />
        </>
      );
    }
    return (
      <OverviewCard
        onRetry={() => void retryCard("overview")}
        state={groupState(
          metrics,
          cardMetrics.overview,
          currentSession.analytics_status,
          retrying === "overview"
        )}
        view={metricView(metrics, "overview", currentSession.analytics_status)}
      />
    );
  }
}
