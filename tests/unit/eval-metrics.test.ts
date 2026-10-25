import { describe, expect, it } from "vitest";
import { firstHitRank, summarizeRetrieval, type QuestionResult } from "@/services/rag/eval-metrics";

const result = (retrieved: string[], expectedFiles: string[]): QuestionResult => ({ question: "q", retrieved, expectedFiles });

describe("firstHitRank", () => {
  it("is 1-based and 0 for a miss", () => {
    expect(firstHitRank(result(["a.ts", "b.ts"], ["b.ts"]))).toBe(2);
    expect(firstHitRank(result(["a.ts"], ["z.ts"]))).toBe(0);
  });

  it("matches a path suffix", () => {
    expect(firstHitRank(result(["src/lib/github.ts"], ["github.ts"]))).toBe(1);
    expect(firstHitRank(result(["src/lib/notgithub.ts"], ["github.ts"]))).toBe(0);
  });
});

describe("summarizeRetrieval", () => {
  const results = [
    result(["a.ts", "x.ts", "y.ts"], ["a.ts"]), // rank 1
    result(["x.ts", "b.ts", "y.ts"], ["b.ts"]), // rank 2
    result(["x.ts", "y.ts", "z.ts"], ["c.ts"]), // miss
  ];

  it("computes hit rate, MRR and precision", () => {
    const metrics = summarizeRetrieval(results, 3);
    expect(metrics.questions).toBe(3);
    expect(metrics.hitRate).toBeCloseTo(2 / 3);
    expect(metrics.mrr).toBeCloseTo((1 + 0.5 + 0) / 3);
    expect(metrics.precision).toBeCloseTo((1 / 3 + 1 / 3 + 0) / 3);
  });

  it("only counts the top k", () => {
    expect(summarizeRetrieval(results, 1).hitRate).toBeCloseTo(1 / 3);
  });

  it("handles no questions", () => {
    expect(summarizeRetrieval([], 5)).toEqual({ questions: 0, hitRate: 0, mrr: 0, precision: 0 });
  });
});
