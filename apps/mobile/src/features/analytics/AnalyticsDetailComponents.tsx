import { arrayValue, numberValue, ownerName, stringValue } from "./analyticsStats";

export function DetailToggle({
  enabled,
  onToggle,
  showDetails
}: {
  enabled: boolean;
  onToggle: () => void;
  showDetails: boolean;
}) {
  if (!enabled) {
    return null;
  }
  return (
    <button className="secondary-action compact-action" onClick={onToggle} type="button">
      {showDetails ? "收起详情" : "查看详情"}
    </button>
  );
}

export function TrackDetailList({
  compact = false,
  showArtists = true,
  tracks
}: {
  compact?: boolean;
  showArtists?: boolean;
  tracks: Record<string, unknown>[];
}) {
  return (
    <div className={compact ? "analytics-list analytics-track-list-compact" : "analytics-list"}>
      {tracks.map((track) => (
        <div className="analytics-row" key={stringValue(track.track_id)}>
          <div>
            <strong>
              {trackTitle(track)}
              <ArtistSuffix artists={showArtists ? trackArtists(track) : []} />
            </strong>
            <p>{arrayValue(track.contributors).map(ownerName).join("、") || "未知来源"}</p>
          </div>
          <span>{numberValue(track.contributor_count)} 人</span>
        </div>
      ))}
      {tracks.length === 0 ? <p className="analytics-muted">暂无明细。</p> : null}
    </div>
  );
}

function trackTitle(track: Record<string, unknown>) {
  return stringValue(track.display_title) || "未知歌曲";
}

function trackArtists(track: Record<string, unknown>) {
  return arrayValueAsStrings(track.artists);
}

function ArtistSuffix({ artists }: { artists: string[] }) {
  if (artists.length === 0) {
    return null;
  }
  return <span className="analytics-track-artist">-{artists.join("、")}</span>;
}

export function ChipList({ items }: { items: string[] }) {
  return (
    <div className="analytics-chip-list">
      {items.map((item) => (
        <span className="analytics-chip" key={item}>
          {item}
        </span>
      ))}
      {items.length === 0 ? <p className="analytics-muted">暂无明细。</p> : null}
    </div>
  );
}

export function arrayValueAsStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
