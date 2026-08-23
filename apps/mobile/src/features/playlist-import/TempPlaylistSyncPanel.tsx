import type { TempPlaylistSyncResponse } from "@mugame/contracts/imports";

interface TempPlaylistSyncPanelProps {
  result: TempPlaylistSyncResponse;
}

export function TempPlaylistSyncPanel({ result }: TempPlaylistSyncPanelProps) {
  return (
    <section className="temp-playlist-panel" aria-label="临时歌单同步结果">
      <div className="full-import-header">
        <h3>{result.status === "ready" ? "临时歌单已就绪" : "临时歌单部分失败"}</h3>
        <span>ID {result.temp_playlist_id}</span>
      </div>
      <p className="match-progress-detail">
        已同步 {result.synced_count} · 跳过 {result.skipped_count}
        {result.failed_count > 0 ? ` · 失败 ${result.failed_count}` : ""}
      </p>
    </section>
  );
}
