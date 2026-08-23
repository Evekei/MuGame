import type {
  ImportSessionResponse,
  MatchJobResponse,
  MatchedTrackItem,
  MatchTracksResponse,
  NeteaseTrackCandidate
} from "@mugame/contracts/imports";
import { useRef, useState } from "react";
import { playlistImportErrorMessage } from "./playlistImportErrors";
import {
  confirmManualMatch,
  getMatchJob,
  startMatchJob
} from "./importPreviewService";

export type MatchState =
  | { status: "idle"; job?: MatchJobResponse; result?: undefined; message?: undefined }
  | {
      status: "loading";
      job: MatchJobResponse;
      result?: MatchTracksResponse;
      message?: undefined;
    }
  | { status: "ready"; job?: MatchJobResponse; result: MatchTracksResponse; message?: undefined }
  | { status: "rate_limited"; job: MatchJobResponse; result?: MatchTracksResponse; message: string }
  | { status: "error"; job?: MatchJobResponse; result?: MatchTracksResponse; message: string };

export function useImportMatching(session: ImportSessionResponse | undefined) {
  const [matching, setMatching] = useState<MatchState>({ status: "idle" });
  const pollRunId = useRef(0);

  async function startMatching() {
    if (!session) {
      return;
    }

    const runId = pollRunId.current + 1;
    pollRunId.current = runId;
    try {
      const job = await startMatchJob(session.id);
      setMatching({ status: "loading", job, result: job.result });
      await pollMatchJob(job.id, runId);
    } catch (error) {
      setMatching((current) => ({
        status: "error",
        job: current.job,
        result: current.result,
        message: playlistImportErrorMessage(error)
      }));
    }
  }

  async function confirmCandidate(
    track: MatchedTrackItem,
    candidate: NeteaseTrackCandidate
  ) {
    if (!session || !matching.result) {
      return;
    }

    const confirmed = await confirmManualMatch(session.id, {
      source_track_ids: track.source_track_ids,
      netease_song_id: candidate.netease_song_id,
      title: candidate.title,
      artists: candidate.artists,
      album: candidate.album,
      duration_ms: candidate.duration_ms
    });
    setMatching({
      status: "ready",
      result: replaceMatchedTrack(matching.result, confirmed)
    });
  }

  return {
    matching,
    resetMatching: () => {
      pollRunId.current += 1;
      setMatching({ status: "idle" });
    },
    startMatching,
    confirmCandidate
  };

  async function pollMatchJob(jobId: string, runId: number) {
    let job = await waitForNextJob(jobId);
    while (runId === pollRunId.current && isPendingJob(job)) {
      setMatching({ status: "loading", job, result: job.result });
      job = await waitForNextJob(jobId);
    }

    if (runId !== pollRunId.current) {
      return;
    }

    if (job.status === "ready" && job.result) {
      setMatching({ status: "ready", result: job.result });
      return;
    }

    if (job.status === "rate_limited") {
      setMatching({
        status: "rate_limited",
        job,
        result: job.result,
        message: job.error ?? "网易云搜索操作频繁，请稍后重试。"
      });
      return;
    }

    setMatching({
      status: "error",
      job,
      result: job.result,
      message: job.error ?? "匹配任务失败，请稍后重试。"
    });
  }
}

function isPendingJob(job: MatchJobResponse) {
  return job.status === "pending" || job.status === "running";
}

async function waitForNextJob(jobId: string) {
  await delay(1000);
  return getMatchJob(jobId);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function replaceMatchedTrack(
  result: MatchTracksResponse,
  confirmed: MatchedTrackItem
): MatchTracksResponse {
  const tracks = result.tracks.map((track) =>
    track.id === confirmed.id ? confirmed : track
  );
  return {
    ...result,
    needs_confirm_count: tracks.filter((track) => track.match_status === "needs_confirm")
      .length,
    auto_matched_count: tracks.filter((track) => track.match_status === "auto_accepted")
      .length,
    tracks
  };
}
