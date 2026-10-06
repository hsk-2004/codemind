import { describe, expect, it } from "vitest";
import { buildMetricsSummary, percentile, type CallRow } from "@/server/metrics-summary";

const row = (over: Partial<CallRow>): CallRow => ({
  createdAt: new Date("2026-10-04T10:15:00Z"),
  operation: "rag_answer",
  provider: "ollama",
  model: "qwen2.5-coder:3b-instruct",
  success: true,
  latencyMs: 1000,
  promptTokens: null,
  completionTokens: null,
  tokensPerSecond: null,
  loadDurationMs: null,
  ...over,
});

describe("percentile", () => {
  it("uses the nearest-rank method", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBeNull();
  });
});

describe("buildMetricsSummary", () => {
  const rows: CallRow[] = [
    row({ latencyMs: 2000, promptTokens: 300, completionTokens: 100, tokensPerSecond: 20, loadDurationMs: 5000 }),
    row({ latencyMs: 4000, promptTokens: 200, completionTokens: 50, tokensPerSecond: 10, loadDurationMs: 50 }),
    row({ operation: "embedding", latencyMs: 100 }),
    row({ operation: "embedding", latencyMs: 300, success: false, createdAt: new Date("2026-10-04T11:40:00Z") }),
  ];
  const summary = buildMetricsSummary(rows, 24);

  it("computes totals across all calls", () => {
    expect(summary.totals).toMatchObject({
      calls: 4,
      errors: 1,
      promptTokens: 500,
      completionTokens: 150,
      avgLatencyMs: 1600,
      avgTokensPerSecond: 15,
      coldStarts: 1,
    });
  });

  it("breaks results down per operation, busiest first", () => {
    expect(summary.byOperation.map((o) => [o.operation, o.calls, o.errors])).toEqual([
      ["rag_answer", 2, 0],
      ["embedding", 2, 1],
    ]);
    expect(summary.byOperation[0]!.avgLatencyMs).toBe(3000);
  });

  it("buckets a 24h range by hour", () => {
    expect(summary.bucket).toBe("hour");
    expect(summary.timeseries.map((t) => t.calls)).toEqual([3, 1]);
    expect(summary.timeseries[0]!.tokens).toBe(650);
  });

  it("buckets longer ranges by day", () => {
    expect(buildMetricsSummary(rows, 24 * 7).timeseries).toHaveLength(1);
  });

  it("compares chat models, leaving embeddings out", () => {
    const mixed = buildMetricsSummary(
      [
        row({ latencyMs: 8000, tokensPerSecond: 50 }),
        row({ provider: "groq", model: "openai/gpt-oss-20b", latencyMs: 400, tokensPerSecond: 600 }),
        row({ provider: "groq", model: "openai/gpt-oss-20b", latencyMs: 600, tokensPerSecond: 700 }),
        row({ operation: "embedding", model: "nomic-embed-text", latencyMs: 100 }),
      ],
      24,
    );
    expect(mixed.byModel.map((m) => [m.provider, m.model, m.calls, m.avgLatencyMs, m.avgTokensPerSecond])).toEqual([
      ["groq", "openai/gpt-oss-20b", 2, 500, 650],
      ["ollama", "qwen2.5-coder:3b-instruct", 1, 8000, 50],
    ]);
  });

  it("handles no data", () => {
    const empty = buildMetricsSummary([], 24);
    expect(empty.totals.calls).toBe(0);
    expect(empty.totals.avgLatencyMs).toBeNull();
    expect(empty.timeseries).toEqual([]);
  });
});
