import type { PlaylistPreviewItem } from "@mugame/contracts/imports";
import { useState } from "react";

interface PlaylistPreviewCardProps {
  item: PlaylistPreviewItem;
  onRetry: (rawText: string) => void;
}

export function PlaylistPreviewCard({ item, onRetry }: PlaylistPreviewCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);

  if (item.preview_status === "failed") {
    return (
      <article className="preview-card preview-card-error">
        <div>
          <h3>识别失败</h3>
          <p>{item.error?.message ?? "无法识别这个歌单链接。"}</p>
        </div>
        <button
          className="secondary-action compact-action"
          onClick={() => onRetry(item.canonical_url ?? "")}
          type="button"
        >
          重试
        </button>
      </article>
    );
  }

  return (
    <article className="preview-card">
      <div className="preview-cover">
        {item.cover_url && !coverFailed ? (
          // Playlist covers come from user-pasted external platforms at runtime.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${item.title ?? "歌单"}封面`}
            onError={() => setCoverFailed(true)}
            src={secureImageUrl(item.cover_url)}
          />
        ) : (
          "歌"
        )}
      </div>
      <div className="preview-card-body">
        <span className="preview-platform">{platformLabel(item.platform)}</span>
        <h3>{item.title}</h3>
        <p className="preview-owner">来自：{item.owner_nickname}</p>
        <p>
          {item.track_count ?? 0} 首 · ID {item.source_playlist_id}
        </p>
      </div>
    </article>
  );
}

function secureImageUrl(url: string) {
  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }

  return url;
}

function platformLabel(platform: PlaylistPreviewItem["platform"]) {
  if (platform === "netease") {
    return "网易云音乐";
  }

  if (platform === "qq") {
    return "QQ 音乐";
  }

  return "未知平台";
}
