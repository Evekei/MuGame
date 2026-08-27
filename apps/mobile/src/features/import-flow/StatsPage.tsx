"use client";

import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { setStoredImportSession } from "./importFlowStore";
import { useStoredImportSession } from "./useStoredImportSession";

const tabs = [
  { id: "stats-overview", label: "统计总览" },
  { id: "stats-shared-tracks", label: "最有共鸣歌曲" },
  { id: "stats-top-artists", label: "Top歌手" },
  { id: "stats-pairwise", label: "口味匹配度" },
  { id: "stats-genres", label: "Top曲风" },
  { id: "stats-unique", label: "独特性" },
  { id: "stats-albums", label: "专辑与多样性" }
];

export function StatsPage() {
  const flow = useStoredImportSession();

  return (
    <main className="content flow-page stats-page">
      <section className="page-intro">
        <h1>统计</h1>
        <p>播放可以继续留在网易云，MuGame 在这里逐步更新结果。</p>
      </section>

      <nav aria-label="统计分区" className="stats-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() =>
              document.getElementById(tab.id)?.scrollIntoView({ block: "start" })
            }
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <AnalyticsDashboard
        onSessionChange={setStoredImportSession}
        session={flow.session}
      />
    </main>
  );
}
