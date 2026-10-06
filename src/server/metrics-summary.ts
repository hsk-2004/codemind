export interface CallRow {
  createdAt: Date;
  operation: string;
  provider: string;
  model: string;
  success: boolean;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  tokensPerSecond: number | null;
  loadDurationMs: number | null;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

const average = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

function summarize(rows: CallRow[]) {
  const latencies = rows.map((r) => r.latencyMs);
  const speeds = rows.flatMap((r) => (r.tokensPerSecond ? [r.tokensPerSecond] : []));
  return {
    calls: rows.length,
    errors: rows.filter((r) => !r.success).length,
    promptTokens: rows.reduce((n, r) => n + (r.promptTokens ?? 0), 0),
    completionTokens: rows.reduce((n, r) => n + (r.completionTokens ?? 0), 0),
    avgLatencyMs: average(latencies),
    p95LatencyMs: percentile(latencies, 95),
    avgTokensPerSecond: average(speeds),
    coldStarts: rows.filter((r) => (r.loadDurationMs ?? 0) > 1000).length,
  };
}

/** Aggregates raw call rows into KPIs, a per-operation breakdown and a time series. */
export function buildMetricsSummary(rows: CallRow[], rangeHours: number) {
  const byOperation = [...new Set(rows.map((r) => r.operation))]
    .map((operation) => ({ operation, ...summarize(rows.filter((r) => r.operation === operation)) }))
    .sort((a, b) => b.calls - a.calls);

  // Embeddings are a different kind of model, so the comparison covers chat models only.
  const chatRows = rows.filter((r) => r.operation !== "embedding");
  const modelGroups = new Map<string, CallRow[]>();
  for (const row of chatRows) {
    const key = JSON.stringify([row.provider, row.model]);
    modelGroups.set(key, [...(modelGroups.get(key) ?? []), row]);
  }
  const byModel = [...modelGroups.values()]
    .map((group) => ({ provider: group[0]!.provider, model: group[0]!.model, ...summarize(group) }))
    .sort((a, b) => b.calls - a.calls);

  const bucketMs = rangeHours <= 24 ? 3_600_000 : 86_400_000;
  const buckets = new Map<number, CallRow[]>();
  for (const row of rows) {
    const key = Math.floor(row.createdAt.getTime() / bucketMs) * bucketMs;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const timeseries = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, bucketRows]) => {
      const s = summarize(bucketRows);
      return {
        bucket: new Date(bucket).toISOString(),
        calls: s.calls,
        errors: s.errors,
        tokens: s.promptTokens + s.completionTokens,
        avgLatencyMs: s.avgLatencyMs,
        avgTokensPerSecond: s.avgTokensPerSecond,
      };
    });

  return { totals: summarize(rows), byOperation, byModel, timeseries, bucket: bucketMs === 3_600_000 ? "hour" : "day" };
}
