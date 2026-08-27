"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AccountEntry } from "@/features/account/AccountEntry";
import { SettingsEntry } from "@/features/settings/SettingsEntry";
import { hydrateThemeState } from "@/features/settings/themeStore";

const steps = [
  { href: "/import", label: "导入", paths: ["/", "/import"] },
  { href: "/confirm", label: "确认", paths: ["/confirm"] },
  { href: "/play", label: "播放", paths: ["/play"] },
  { href: "/stats", label: "统计", paths: ["/stats"] }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = normalizePathname(usePathname() || "/");

  useEffect(() => {
    hydrateThemeState();
  }, []);

  return (
    <div className="shell">
      <header aria-label="应用顶部栏" className="topbar">
        <div className="topbar-actions">
          <AccountEntry />
          <SettingsEntry />
        </div>
        <strong className="brand-mark">MuGame</strong>
      </header>

      <nav aria-label="导入流程" className="flow-nav">
        {steps.map((step) => {
          const isCurrent = step.paths.includes(pathname);
          return (
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className="flow-step"
              href={step.href}
              key={step.href}
            >
              {step.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

function normalizePathname(pathname: string) {
  const path = pathname
    .split("?")[0]
    .replace(/\/index\.html$/, "/")
    .replace(/\.html$/, "")
    .replace(/\/$/, "");
  return path || "/";
}
