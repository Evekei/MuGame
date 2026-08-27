import type { ImportSessionResponse } from "@mugame/contracts/imports";
import { useState } from "react";
import { AnalyticsCard } from "./AnalyticsCard";
import {
  arrayValueAsStrings,
  ChipList,
  DetailToggle,
  TrackDetailList
} from "./AnalyticsDetailComponents";
import {
  arrayValue,
  barWidth,
  confidenceText,
  coverageText,
  decimal,
  isLowCoverage,
  metricMap,
  metricView,
  numberValue,
  ownerName,
  pairKey,
  percent,
  recordValue,
  shouldPollAnalytics,
  stringValue
} from "./analyticsStats";

export const cardMetrics = {
  albums: ["top_albums", "shared_albums", "artist_diversity", "genre_diversity"],
  genres: ["top_genres", "shared_genres"],
  overview: ["overview"],
  pairwise: [
    "pairwise_track_similarity",
    "pairwise_artist_similarity",
    "pairwise_genre_similarity"
  ],
  sharedTracks: ["top_shared_tracks"],
  topArtists: ["top_artists"],
  uniqueTaste: ["unique_taste_by_owner"]
};

export function OverviewCard({ onRetry, state, view }: CardProps) {
  const payload = view.payload;
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="总览">
      <div className="analytics-metric-grid">
        <Metric label="参与人数" value={numberValue(payload?.participant_count)} />
        <Metric label="原始歌曲" value={numberValue(payload?.raw_track_count)} />
        <Metric label="去重歌曲" value={numberValue(payload?.unique_track_count)} />
        <Metric label="共同歌曲" value={numberValue(payload?.shared_track_count)} />
      </div>
    </AnalyticsCard>
  );
}

export function SharedTracksCard({ onRetry, state, view }: CardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const tracks = arrayValue(view.payload?.tracks);
  const visibleTracks = showDetails ? tracks : tracks.slice(0, 6);
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="你们最有共鸣的歌">
      <div className="analytics-list">
        <TrackDetailList tracks={visibleTracks} />
        {tracks.length === 0 ? <p className="analytics-muted">暂无共同歌曲。</p> : null}
        <DetailToggle
          enabled={tracks.length > 0}
          onToggle={() => setShowDetails((current) => !current)}
          showDetails={showDetails}
        />
      </div>
    </AnalyticsCard>
  );
}

export function PairwiseTasteCard({ metrics, onRetry, session, state }: GroupCardProps) {
  const [selectedPairKey, setSelectedPairKey] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const trackPairs = arrayValue(metrics.get("pairwise_track_similarity")?.payload.pairs);
  const artistPairs = arrayValue(metrics.get("pairwise_artist_similarity")?.payload.pairs);
  const genrePairs = arrayValue(metrics.get("pairwise_genre_similarity")?.payload.pairs);
  const artistByPair = new Map(artistPairs.map((pair) => [pairKey(pair), pair]));
  const genreByPair = new Map(genrePairs.map((pair) => [pairKey(pair), pair]));
  const selectedPair = selectedPairKey
    ? trackPairs.find((pair) => pairKey(pair) === selectedPairKey)
    : trackPairs[0];
  const selectedKey = selectedPair ? pairKey(selectedPair) : "";
  const selectedArtistPair = selectedKey ? artistByPair.get(selectedKey) : undefined;
  const selectedGenrePair = selectedKey ? genreByPair.get(selectedKey) : undefined;
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="两两音乐品味">
      <div className="analytics-list">
        {trackPairs.length > 1 ? (
          <label className="pair-selector">
            <span>选择组合</span>
            <select
              onChange={(event) => setSelectedPairKey(event.target.value)}
              value={selectedKey}
            >
              {trackPairs.map((pair) => (
                <option key={pairKey(pair)} value={pairKey(pair)}>
                  {ownerName(pair.owner_a)} vs {ownerName(pair.owner_b)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedPair ? (
          <div className="taste-pair">
            <strong>{ownerName(selectedPair.owner_a)} vs {ownerName(selectedPair.owner_b)}</strong>
            <ScoreLine label="歌曲重合度" value={selectedPair.jaccard} />
            <ScoreLine label="歌手重合度" value={selectedArtistPair?.jaccard} />
            <ScoreLine label="曲风相似度" value={selectedGenrePair?.jaccard} />
          </div>
        ) : null}
        {showDetails && selectedPair ? (
          <div className="analytics-detail-panel">
            <h4>重合歌曲</h4>
            <TrackDetailList tracks={arrayValue(selectedPair.shared_tracks)} />
            <h4>重合歌手</h4>
            <ChipList items={arrayValueAsStrings(selectedArtistPair?.shared_artists)} />
          </div>
        ) : null}
        {trackPairs.length === 0 && session.analytics_status === "completed" ? (
          <p className="analytics-muted">参与人数不足，无法形成两两对比。</p>
        ) : null}
        <DetailToggle
          enabled={Boolean(selectedPair)}
          onToggle={() => setShowDetails((current) => !current)}
          showDetails={showDetails}
        />
      </div>
    </AnalyticsCard>
  );
}

export function TopArtistsCard({ onRetry, state, view }: CardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const allArtists = arrayValue(view.payload?.artists);
  const artists = showDetails ? allArtists : allArtists.slice(0, 8);
  const shared = artists.filter((artist) => numberValue(artist.participant_count) >= 2);
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="Top 歌手 / 共同歌手">
      <div className="analytics-list">
        {artists.map((artist) => (
          <div className="analytics-detail-row" key={stringValue(artist.artist_key)}>
            <div className="rank-row">
              <span>{stringValue(artist.artist) || "未知歌手"}</span>
              <strong>{numberValue(artist.unique_track_count)}首</strong>
            </div>
            {showDetails ? (
              <TrackDetailList compact showArtists={false} tracks={arrayValue(artist.tracks)} />
            ) : null}
          </div>
        ))}
        {artists.length === 0 ? <p className="analytics-muted">暂无歌手数据。</p> : null}
        <DetailToggle
          enabled={allArtists.length > 0}
          onToggle={() => setShowDetails((current) => !current)}
          showDetails={showDetails}
        />
      </div>
      {shared.length > 0 ? (
        <p className="analytics-muted">共同歌手：{shared.map((artist) => stringValue(artist.artist)).join("、")}</p>
      ) : (
        <p className="analytics-muted">暂无共同歌手。</p>
      )}
    </AnalyticsCard>
  );
}

export function GenresCard({ metrics, onRetry, session, state }: GroupCardProps) {
  const topGenres = recordValue(metrics.get("top_genres")?.payload);
  const sharedGenres = arrayValue(metrics.get("shared_genres")?.payload.genres);
  const genres = arrayValue(topGenres.overall).slice(0, 8);
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="Top 曲风 / 共同曲风">
      <div className="analytics-subtle">
        <span>{coverageText(topGenres)}</span>
        <span>{confidenceText(topGenres)}</span>
      </div>
      {isLowCoverage(topGenres) ? (
        <p className="analytics-warning">曲风数据不足，结果只供参考。</p>
      ) : null}
      <RankList items={genres} labelKey="genre" valueKey="share" valueFormatter={percent} />
      {sharedGenres.length > 0 ? (
        <p className="analytics-muted">共同曲风：{sharedGenres.map((genre) => stringValue(genre.genre)).join("、")}</p>
      ) : session.analytics_status === "completed" ? (
        <p className="analytics-muted">暂无共同曲风。</p>
      ) : null}
    </AnalyticsCard>
  );
}

export function UniqueTasteCard({ onRetry, state, view }: CardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const owners = arrayValue(view.payload?.owners);
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="独特性">
      <div className="analytics-list">
        {owners.map((row) => (
          <div className="analytics-detail-row" key={stringValue(recordValue(row.owner).owner_source_id)}>
            <div className="analytics-row">
              <div>
                <strong>{ownerName(row.owner)}</strong>
                <p>独占歌手 {numberValue(row.exclusive_artist_count)}/{numberValue(row.total_artist_count)}</p>
              </div>
              <span>{percent(row.exclusive_track_ratio)}</span>
            </div>
            {showDetails ? (
              <div className="analytics-detail-panel">
                <h4>独特歌手</h4>
                <ChipList items={arrayValueAsStrings(row.exclusive_artists)} />
                <h4>独占歌曲</h4>
                <TrackDetailList tracks={arrayValue(row.exclusive_tracks)} />
              </div>
            ) : null}
          </div>
        ))}
        <DetailToggle
          enabled={owners.length > 0}
          onToggle={() => setShowDetails((current) => !current)}
          showDetails={showDetails}
        />
      </div>
    </AnalyticsCard>
  );
}

export function AlbumsDiversityCard({ metrics, onRetry, state }: GroupCardProps) {
  const topAlbums = recordValue(metrics.get("top_albums")?.payload);
  const artistDiversity = recordValue(metrics.get("artist_diversity")?.payload.overall);
  const genreDiversity = recordValue(metrics.get("genre_diversity")?.payload);
  const genreOverall = recordValue(genreDiversity.overall);
  const genreEntropy = genreOverall.shannon_entropy;
  return (
    <AnalyticsCard onRetry={onRetry} state={state} title="专辑与多样性">
      <div className="analytics-subtle"><span>{coverageText(topAlbums)}</span></div>
      <RankList items={arrayValue(topAlbums.albums).slice(0, 5)} labelKey="album" valueKey="unique_track_count" suffix="首" />
      <div className="analytics-metric-grid">
        <Metric label="歌手数" value={numberValue(artistDiversity.unique_artists)} />
        <Metric label="Top 歌手占比" value={percent(artistDiversity.top_artist_share)} />
        <Metric label="歌手熵" value={decimal(artistDiversity.shannon_entropy)} />
        <Metric label="曲风熵" value={genreEntropy === undefined ? "数据不足" : decimal(genreEntropy)} />
      </div>
    </AnalyticsCard>
  );
}

export function LyricKeywordsCard({ metrics }: { metrics: ReturnType<typeof metricMap> }) {
  const metric = metrics.get("lyric_keywords");
  return (
    <section className="analytics-card" aria-label="歌词关键词">
      <div className="analytics-card-header">
        <h3>歌词关键词</h3>
        <span>{metric ? "已开启" : "未开启"}</span>
      </div>
      {metric ? (
        <p className="analytics-muted">歌词关键词为慢任务，完成后会在这里显示。</p>
      ) : (
        <p className="analytics-muted">当前未启用歌词关键词分析。</p>
      )}
    </section>
  );
}

export function groupState(
  metrics: ReturnType<typeof metricMap>,
  keys: string[],
  status: ImportSessionResponse["analytics_status"],
  retrying: boolean
) {
  if (retrying) {
    return "analyzing";
  }
  if (keys.some((key) => metrics.get(key)?.status === "failed")) {
    return "failed";
  }
  if (keys.every((key) => metrics.has(key))) {
    return "ready";
  }
  if (status === "failed") {
    return "failed";
  }
  if (shouldPollAnalytics(status)) {
    return "analyzing";
  }
  return "empty";
}

interface CardProps {
  onRetry: () => void;
  state: ReturnType<typeof groupState>;
  view: ReturnType<typeof metricView>;
}

interface GroupCardProps {
  metrics: ReturnType<typeof metricMap>;
  onRetry: () => void;
  session: ImportSessionResponse;
  state: ReturnType<typeof groupState>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="analytics-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="score-line">
      <span>{label}</span>
      <div><i style={{ width: barWidth(value) }} /></div>
      <strong>{percent(value)}</strong>
    </div>
  );
}

function RankList({
  items,
  labelKey,
  suffix = "",
  valueFormatter,
  valueKey
}: {
  items: Record<string, unknown>[];
  labelKey: string;
  suffix?: string;
  valueFormatter?: (value: unknown) => string;
  valueKey: string;
}) {
  return (
    <div className="rank-list">
      {items.map((item) => (
        <div className="rank-row" key={stringValue(item[labelKey])}>
          <span>{stringValue(item[labelKey]) || "未知"}</span>
          <strong>{valueFormatter ? valueFormatter(item[valueKey]) : `${numberValue(item[valueKey])}${suffix}`}</strong>
        </div>
      ))}
      {items.length === 0 ? <p className="analytics-muted">暂无数据。</p> : null}
    </div>
  );
}
