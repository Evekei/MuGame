"use client";

import { useState } from "react";
import {
  AnalyticsDashboard,
  type AnalyticsSectionKey
} from "@/features/analytics/AnalyticsDashboard";
import { setStoredImportSession } from "./importFlowStore";
import { useStoredImportSession } from "./useStoredImportSession";

const tabs: { key: AnalyticsSectionKey; label: string }[] = [
  { key: "overview", label: "统计总览" },
  { key: "sharedTracks", label: "最有共鸣歌曲" },
  { key: "topArtists", label: "Top歌手" },
  { key: "pairwise", label: "口味匹配度" },
  { key: "genres", label: "Top曲风" },
  { key: "uniqueTaste", label: "独特性" },
  { key: "albums", label: "专辑与多样性" }
];

export function StatsPage() {
  const flow = useStoredImportSession();
  const [activeSection, setActiveSection] =
    useState<AnalyticsSectionKey>("overview");

  return (
    <main className="content flow-page stats-page">
      <section className="page-intro">
        <h1>统计</h1>
        <p>播放可以继续留在网易云，MuGame 在这里逐步更新结果。</p>
      </section>

      <nav aria-label="统计分区" className="stats-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeSection === tab.key}
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <AnalyticsDashboard
        activeSection={activeSection}
        onSessionChange={setStoredImportSession}
        session={flow.session}
      />
    </main>
  );
}
