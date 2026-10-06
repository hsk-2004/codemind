import { describe, expect, it, vi } from "vitest";
import { emitLlmCall, onLlmCall, timingsToMetrics, type LlmCallEvent } from "@/services/telemetry";

describe("timingsToMetrics", () => {
  it("converts Ollama nanosecond timings and computes tokens per second", () => {
    expect(
      timingsToMetrics({
        prompt_eval_count: 120,
        eval_count: 50,
        total_duration: 3_500_000_000,
        load_duration: 20_000_000,
        prompt_eval_duration: 900_000_000,
        eval_duration: 2_500_000_000,
      }),
    ).toEqual({
      promptTokens: 120,
      completionTokens: 50,
      totalDurationMs: 3500,
      loadDurationMs: 20,
      promptEvalMs: 900,
      evalMs: 2500,
      tokensPerSecond: 20,
    });
  });

  it("leaves speed undefined when the model reports no generation time", () => {
    expect(timingsToMetrics({ eval_count: 10 }).tokensPerSecond).toBeUndefined();
    expect(timingsToMetrics(undefined)).toEqual({});
  });
});

describe("telemetry events", () => {
  const event: LlmCallEvent = { operation: "rag_answer", model: "m", success: true, inputChars: 10, latencyMs: 5 };

  it("delivers events to listeners and supports unsubscribing", () => {
    const listener = vi.fn();
    const off = onLlmCall(listener);
    emitLlmCall(event);
    off();
    emitLlmCall(event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("never lets a failing listener break the caller", () => {
    const off = onLlmCall(() => {
      throw new Error("db down");
    });
    expect(() => emitLlmCall(event)).not.toThrow();
    off();
  });
});
