import type {
  ImportSessionResponse,
  MatchTracksResponse,
  TempPlaylistSyncResponse
} from "@mugame/contracts/imports";

export function nextFullImportStatus(session: ImportSessionResponse) {
  return shouldPollSession(session) ? "loading" : "ready";
}

export function shouldPollSession(session: ImportSessionResponse) {
  return (
    session.status === "pending" ||
    session.status === "reading" ||
    session.status === "importing" ||
    session.status === "normalizing" ||
    session.status === "matching" ||
    session.status === "syncing_temp" ||
    session.analytics_status === "pending" ||
    session.analytics_status === "running" ||
    session.analytics_status === "partial"
  );
}

export function matchResultFromSession(
  session: ImportSessionResponse
): MatchTracksResponse | undefined {
  if (session.matched_tracks.length === 0) {
    return undefined;
  }

  return {
    import_session_id: session.id,
    total_track_count: session.matched_tracks.length,
    auto_matched_count: session.matched_tracks.filter(
      (track) => track.match_status === "auto_accepted"
    ).length,
    needs_confirm_count: session.matched_tracks.filter(
      (track) => track.match_status === "needs_confirm"
    ).length,
    no_match_count: session.matched_tracks.filter(
      (track) => track.match_status === "no_match"
    ).length,
    tracks: session.matched_tracks
  };
}

export function tempPlaylistResultFromSession(
  session: ImportSessionResponse
): TempPlaylistSyncResponse | undefined {
  if (!session.playback) {
    return undefined;
  }

  const synced = session.progress?.sync.current ?? 0;

  return {
    import_session_id: session.id,
    temp_playlist_id: session.playback.temp_playlist_id,
    status: "ready",
    synced_count: synced,
    skipped_count: Math.max(0, session.matched_tracks.length - synced),
    failed_count: 0,
    ready_at: session.ready_to_play_at,
    batches: []
  };
}

export function AnalyticsStatusText({
  status
}: {
  status: ImportSessionResponse["analytics_status"];
}) {
  if (!status) {
    return null;
  }
  if (status === "completed") {
    return <p className="import-confirmed">统计已完成。</p>;
  }
  if (status === "failed") {
    return <p className="account-error">统计分析失败，不影响播放。</p>;
  }
  return <p className="import-confirmed">统计正在分析。</p>;
}
