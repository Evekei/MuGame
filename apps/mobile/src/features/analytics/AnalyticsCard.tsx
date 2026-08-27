import type { ReactNode } from "react";
import type { CardState } from "./analyticsStats";

interface AnalyticsCardProps {
  children: ReactNode;
  onRetry?: () => void;
  state: CardState;
  title: string;
}

export function AnalyticsCard({
  children,
  onRetry,
  state,
  title
}: AnalyticsCardProps) {
  return (
    <section className="analytics-card" aria-label={title}>
      <div className="analytics-card-header">
        <h3>{title}</h3>
        {state === "ready" ? <span>已完成</span> : null}
        {state === "analyzing" ? <span>分析中</span> : null}
        {state === "failed" ? <span className="analytics-failed">失败</span> : null}
      </div>
      {state === "ready" ? children : null}
      {state === "analyzing" ? <p className="analytics-muted">分析中，完成后会自动显示。</p> : null}
      {state === "empty" ? <p className="analytics-muted">导入完成后开始生成。</p> : null}
      {state === "failed" ? (
        <div className="analytics-card-fallback">
          <p className="analytics-muted">这一项分析失败，其它结果不受影响。</p>
          {onRetry ? (
            <button className="secondary-action compact-action" onClick={onRetry} type="button">
              重试分析
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
