"use client";

import type { MatchedTrackItem } from "@mugame/contracts/imports";
import { useState } from "react";
import { HealthPanel } from "@/components/HealthPanel";
import { HomeNavigation } from "@/features/navigation/HomeNavigation";
import { PlayerPage } from "@/features/player/PlayerPage";
import { PlaylistImportPreview } from "@/features/playlist-import/PlaylistImportPreview";

export function HomeExperience() {
  const [playTracks, setPlayTracks] = useState<MatchedTrackItem[]>([]);

  return (
    <main className="content">
      <div className="hero-panel">
        <p className="eyebrow">移动端歌单小游戏</p>
        <h1>把朋友们的歌单混在一起猜。</h1>
        <p>导入多人歌单，随机播放，再揭晓这首歌来自谁。</p>
      </div>

      <HomeNavigation />

      <section className="stage-list" aria-label="功能区域">
        <article className="stage-panel" id="import">
          <span>01</span>
          <div>
            <h2>导入歌单</h2>
            <p>粘贴分享文案，导入前先确认歌单来自谁。</p>
            <PlaylistImportPreview onReadyToPlay={setPlayTracks} />
          </div>
        </article>
        <article className="stage-panel" id="play">
          <span>02</span>
          <div>
            <h2>正在播放/开始游戏</h2>
            <p>临时歌单准备好后，从这里进入播放和猜来源。</p>
            {playTracks.length > 0 ? (
              <PlayerPage tracks={playTracks} />
            ) : (
              <div className="player-empty" aria-label="播放页占位">
                <p>同步临时歌单后，播放控制会出现在这里。</p>
              </div>
            )}
          </div>
        </article>
        <article className="stage-panel" id="stats">
          <span>03</span>
          <div>
            <h2>统计</h2>
            <p>统计会异步产出，不阻塞播放。</p>
          </div>
        </article>
      </section>

      <HealthPanel />
    </main>
  );
}
