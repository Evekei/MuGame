import type { ImportSessionResponse } from "@mugame/contracts/imports";

interface FullImportProgressProps {
  session: ImportSessionResponse;
  onRetry: () => void;
}

export function FullImportProgress({ session, onRetry }: FullImportProgressProps) {
  const failedCount = session.source_playlists.filter(
    (source) => source.status === "failed"
  ).length;

  return (
    <section className="full-import-progress" aria-label="完整导入进度">
      <div className="full-import-header">
        <h3>完整导入</h3>
        <span>{statusLabel(session.status)}</span>
      </div>

      <div className="source-progress-list">
        {session.source_playlists.map((source) => (
          <article className="source-progress-row" key={source.id}>
            <div>
              <p className="source-progress-title">
                {sourceStatusLabel(source.status)} {source.title}
              </p>
              <p>来自：{source.owner_nickname}</p>
              {source.error ? (
                <p className="account-error">{source.error.message}</p>
              ) : null}
            </div>
            <strong>
              {source.read_count}/{source.track_count ?? "?"}
            </strong>
          </article>
        ))}
      </div>

      <p className="import-confirmed">
        已保存 {session.raw_track_count} 条原始歌曲记录。
      </p>

      {failedCount > 0 ? (
        <button className="secondary-action" onClick={onRetry} type="button">
          重试读取失败歌单
        </button>
      ) : null}
    </section>
  );
}

function statusLabel(status: ImportSessionResponse["status"]) {
  if (status === "ready") {
    return "已完成";
  }
  if (status === "partial_failed") {
    return "部分失败";
  }
  if (status === "failed") {
    return "失败";
  }
  return "读取中";
}

function sourceStatusLabel(
  status: ImportSessionResponse["source_playlists"][number]["status"]
) {
  if (status === "ready") {
    return "已读取";
  }
  if (status === "failed") {
    return "读取失败";
  }
  if (status === "pending") {
    return "等待读取";
  }
  return "正在读取";
}
