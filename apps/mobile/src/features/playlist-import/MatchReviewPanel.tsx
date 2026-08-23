import type {
  MatchedTrackItem,
  MatchTracksResponse,
  NeteaseTrackCandidate
} from "@mugame/contracts/imports";

interface MatchReviewPanelProps {
  matching: MatchTracksResponse;
  onConfirm: (track: MatchedTrackItem, candidate: NeteaseTrackCandidate) => void;
}

export function MatchReviewPanel({ matching, onConfirm }: MatchReviewPanelProps) {
  const manualTracks = matching.tracks.filter(
    (track) => track.match_status === "needs_confirm"
  );

  return (
    <section className="match-review-panel" aria-label="网易云匹配结果">
      <div className="full-import-header">
        <h3>网易云匹配</h3>
        <span>
          自动 {matching.auto_matched_count} · 待确认 {matching.needs_confirm_count} · 跳过{" "}
          {matching.no_match_count}
        </span>
      </div>

      {manualTracks.length > 0 ? (
        <div className="match-review-list">
          {manualTracks.map((track) => (
            <article className="match-review-row" key={track.id}>
              <div>
                <p className="source-progress-title">{track.display_title}</p>
                <p>{track.artists.join(" / ")}</p>
                <p>来源：{track.contributors.map((item) => item.owner_nickname).join("、")}</p>
              </div>
              <div className="candidate-list">
                {track.candidates.slice(0, 5).map((candidate) => (
                  <button
                    className="candidate-button"
                    key={candidate.netease_song_id}
                    onClick={() => onConfirm(track, candidate)}
                    type="button"
                  >
                    <strong>{candidate.title}</strong>
                    <span>{candidate.artists.join(" / ")}</span>
                    <span>{Math.round(candidate.score * 100)}%</span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="import-confirmed">没有需要人工确认的歌曲。</p>
      )}
    </section>
  );
}
