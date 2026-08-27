"use client";

import { useRef, useState } from "react";
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
  const tabsRef = useRef<HTMLElement>(null);
  const touchRef = useRef({ scrollLeft: 0, x: 0, y: 0 });

  return (
    <main className="content flow-page stats-page">
      <section className="page-intro">
        <h1>统计</h1>
        <p>播放可以继续留在网易云，MuGame 在这里逐步更新结果。</p>
      </section>

      <nav
        aria-label="统计分区"
        className="stats-tabs"
        onTouchMove={(event) => {
          const touch = event.touches[0];
          const tabsElement = tabsRef.current;
          if (!touch || !tabsElement) {
            return;
          }
          const deltaX = touch.clientX - touchRef.current.x;
          const deltaY = touch.clientY - touchRef.current.y;
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            tabsElement.scrollLeft = touchRef.current.scrollLeft - deltaX;
            event.preventDefault();
          }
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch || !tabsRef.current) {
            return;
          }
          touchRef.current = {
            scrollLeft: tabsRef.current.scrollLeft,
            x: touch.clientX,
            y: touch.clientY
          };
        }}
        ref={tabsRef}
        role="tablist"
      >
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
