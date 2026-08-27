"use client";

import { useRouter } from "next/navigation";
import { PlayerPage } from "@/features/player/PlayerPage";
import { useStoredImportSession } from "./useStoredImportSession";

export function PlayRoutePage() {
  const router = useRouter();
  const flow = useStoredImportSession({ pollAnalytics: true });
  const readyPayload =
    flow.readyPayload ??
    (flow.session?.playback
      ? {
          tempPlaylistId: flow.session.playback.temp_playlist_id,
          tracks: flow.session.playback.tracks
        }
      : undefined);

  return (
    <main className="content flow-page">
      <section className="page-intro">
        <h1>播放</h1>
        <p>临时歌单准备好后，从这里跳到网易云。</p>
      </section>

      {readyPayload ? (
        <PlayerPage
          analyticsSession={flow.session}
          onOpenStats={() => router.push("/stats")}
          onPlaybackOpened={() => router.replace("/stats")}
          tempPlaylistId={readyPayload.tempPlaylistId}
          tracks={readyPayload.tracks}
        />
      ) : (
        <section className="empty-panel">
          <p>临时歌单还没有准备好。</p>
          <a className="text-link" href="/confirm">
            回到确认页
          </a>
        </section>
      )}
    </main>
  );
}
