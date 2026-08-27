import type {
  AnalyticsMetric,
  AnalyticsStatus,
  ImportSessionResponse
} from "@mugame/contracts/imports";

export type CardState = "empty" | "analyzing" | "ready" | "failed";

export interface MetricView {
  state: CardState;
  payload?: Record<string, unknown>;
}

export function metricMap(session: ImportSessionResponse | undefined) {
  return new Map(
    session?.analytics_results.map((metric) => [metric.metric_key, metric]) ?? []
  );
}

export function metricView(
  metrics: Map<string, AnalyticsMetric>,
  key: string,
  analyticsStatus: AnalyticsStatus | undefined
): MetricView {
  const metric = metrics.get(key);
  if (metric?.status === "failed") {
    return { state: "failed", payload: metric.payload };
  }
  if (metric) {
    return { state: "ready", payload: metric.payload };
  }
  if (analyticsStatus === "failed") {
    return { state: "failed" };
  }
  if (
    analyticsStatus === "pending" ||
    analyticsStatus === "running" ||
    analyticsStatus === "partial"
  ) {
    return { state: "analyzing" };
  }
  return { state: "empty" };
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

export function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function percent(value: unknown) {
  return `${Math.round(numberValue(value) * 100)}%`;
}

export function decimal(value: unknown) {
  return numberValue(value).toFixed(2);
}

export function coverageText(payload: Record<string, unknown> | undefined) {
  const coverage = recordValue(payload?.data_coverage);
  const known = numberValue(coverage.known_track_count);
  const total = numberValue(coverage.total_track_count);
  if (total === 0) {
    return "覆盖率 0%";
  }
  return `覆盖率 ${percent(coverage.ratio)} (${known}/${total})`;
}

export function isLowCoverage(
  payload: Record<string, unknown> | undefined,
  threshold = 0.6
) {
  const coverage = recordValue(payload?.data_coverage);
  const total = numberValue(coverage.total_track_count);
  return total > 0 && numberValue(coverage.ratio) < threshold;
}

export function confidenceText(payload: Record<string, unknown> | undefined) {
  const confidence = recordValue(payload?.confidence);
  const average = numberValue(confidence.average);
  if (average === 0) {
    return "置信度暂无";
  }
  return `平均置信度 ${percent(average)}`;
}

export function pairKey(pair: Record<string, unknown>) {
  const ownerA = recordValue(pair.owner_a);
  const ownerB = recordValue(pair.owner_b);
  return `${stringValue(ownerA.owner_source_id)}:${stringValue(ownerB.owner_source_id)}`;
}

export function ownerName(owner: unknown) {
  return stringValue(recordValue(owner).owner_nickname) || "未知用户";
}

export function barWidth(value: unknown) {
  return `${Math.min(100, Math.max(4, Math.round(numberValue(value) * 100)))}%`;
}

export function shouldPollAnalytics(status: AnalyticsStatus | undefined) {
  return status === "pending" || status === "running" || status === "partial";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
