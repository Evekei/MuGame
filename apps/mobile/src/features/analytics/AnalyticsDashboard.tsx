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
  onSessionChange?: (session: ImportSessionResponse) => void;
  session?: ImportSessionResponse;
}

export function AnalyticsDashboard({ onSessionChange, session }: AnalyticsDashboardProps) {
  const [retrying, setRetrying] = useState<string | undefined>();
  const metrics = useMemo(() => metricMap(session), [session]);

  useEffect(() => {
    if (!session?.id || !shouldPollAnalytics(session.analytics_status)) {
      return;
    }
    const timeout = window.setTimeout(async () => {
      const nextSession = await getImportSession(session.id);
      onSessionChange?.(nextSession);
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [onSessionChange, session?.analytics_status, session?.id]);

  if (!session) {
    return (
      <div className="analytics-empty">
        <p>临时歌单准备好后，统计结果会出现在这里。</p>
      </div>
    );
  }

  async function retryCard(cardKey: string) {
    if (!session) {
      return;
    }
    setRetrying(cardKey);
    try {
      const nextSession = await retryImportAnalytics(session.id);
      onSessionChange?.(nextSession);
    } finally {
      setRetrying(undefined);
    }
  }

  return (
    <div className="analytics-dashboard">
      <div id="stats-overview">
        <OverviewCard
          onRetry={() => void retryCard("overview")}
          state={groupState(metrics, cardMetrics.overview, session.analytics_status, retrying === "overview")}
          view={metricView(metrics, "overview", session.analytics_status)}
        />
      </div>
      <div id="stats-shared-tracks">
        <SharedTracksCard
          onRetry={() => void retryCard("sharedTracks")}
          state={groupState(metrics, cardMetrics.sharedTracks, session.analytics_status, retrying === "sharedTracks")}
          view={metricView(metrics, "top_shared_tracks", session.analytics_status)}
        />
      </div>
      <div id="stats-top-artists">
        <TopArtistsCard
          onRetry={() => void retryCard("topArtists")}
          state={groupState(metrics, cardMetrics.topArtists, session.analytics_status, retrying === "topArtists")}
          view={metricView(metrics, "top_artists", session.analytics_status)}
        />
      </div>
      <div id="stats-pairwise">
        <PairwiseTasteCard
          metrics={metrics}
          onRetry={() => void retryCard("pairwise")}
          session={session}
          state={groupState(metrics, cardMetrics.pairwise, session.analytics_status, retrying === "pairwise")}
        />
      </div>
      <div id="stats-genres">
        <GenresCard
          metrics={metrics}
          onRetry={() => void retryCard("genres")}
          session={session}
          state={groupState(metrics, cardMetrics.genres, session.analytics_status, retrying === "genres")}
        />
      </div>
      <div id="stats-unique">
        <UniqueTasteCard
          onRetry={() => void retryCard("uniqueTaste")}
          state={groupState(metrics, cardMetrics.uniqueTaste, session.analytics_status, retrying === "uniqueTaste")}
          view={metricView(metrics, "unique_taste_by_owner", session.analytics_status)}
        />
      </div>
      <div id="stats-albums">
        <AlbumsDiversityCard
          metrics={metrics}
          onRetry={() => void retryCard("albums")}
          session={session}
          state={groupState(metrics, cardMetrics.albums, session.analytics_status, retrying === "albums")}
        />
      </div>
      <LyricKeywordsCard metrics={metrics} />
    </div>
  );
}
