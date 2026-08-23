import type { MatchJobResponse } from "@mugame/contracts/imports";

interface MatchJobProgressProps {
  job: MatchJobResponse;
}

export function MatchJobProgress({ job }: MatchJobProgressProps) {
  const percent =
    job.total_track_count === 0
      ? 0
      : Math.round((job.processed_track_count / job.total_track_count) * 100);
  const title = job.status === "rate_limited" ? "网易云限流中" : "正在匹配";

  return (
    <section className="match-job-progress" aria-label="网易云匹配进度">
      <div className="full-import-header">
        <h3>{title}</h3>
        <span>
          {job.processed_track_count}/{job.total_track_count}
        </span>
      </div>
      <div
        className="match-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={job.total_track_count}
        aria-valuenow={job.processed_track_count}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="match-progress-detail">
        自动 {job.auto_matched_count} · 待确认 {job.needs_confirm_count} · 跳过{" "}
        {job.no_match_count}
      </p>
      {job.current_title ? (
        <p className="match-progress-current">当前：{job.current_title}</p>
      ) : null}
    </section>
  );
}
