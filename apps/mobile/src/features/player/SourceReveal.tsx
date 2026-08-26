"use client";

import type { Contributor } from "@mugame/contracts/imports";
import { useState } from "react";

interface SourceRevealProps {
  contributors: readonly Contributor[];
  trackId?: string;
}

export function SourceReveal({ contributors, trackId }: SourceRevealProps) {
  const [revealedTrackId, setRevealedTrackId] = useState<string>();
  const revealed = revealedTrackId === trackId;

  if (!trackId || contributors.length === 0) {
    return null;
  }

  return (
    <section className="source-reveal" aria-label="歌曲来源">
      <button
        className="secondary-action source-reveal-button"
        onClick={() => setRevealedTrackId(revealed ? undefined : trackId)}
        type="button"
      >
        {revealed ? "Hide" : "Check"}
      </button>

      {revealed ? (
        <div className="source-chip-list" aria-label="来源昵称">
          {contributors.map((contributor) => (
            <span className="source-chip" key={contributorKey(contributor)}>
              {contributor.owner_avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={contributor.owner_avatar_url} />
              ) : null}
              {contributor.owner_nickname}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function contributorKey(contributor: Contributor) {
  return [
    contributor.platform,
    contributor.source_playlist_id,
    contributor.owner_source_id
  ].join(":");
}
