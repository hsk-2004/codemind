import type { PrismaClient } from "@prisma/client";
import { onLlmCall } from "@/services/telemetry";
import { recordPrometheus } from "./prometheus";

const globalForSink = globalThis as unknown as { codemindTelemetrySink?: boolean };

/** Persists every model call (Metrics tab) and updates Prometheus metrics (Grafana). */
export function registerTelemetrySink(db: PrismaClient): void {
  if (globalForSink.codemindTelemetrySink) return;
  globalForSink.codemindTelemetrySink = true;

  onLlmCall((event) => {
    recordPrometheus(event);
    void db.llmCall
      .create({
        data: {
          projectId: event.projectId ?? null,
          operation: event.operation,
          provider: event.provider ?? "ollama",
          model: event.model,
          success: event.success,
          error: event.error ?? null,
          inputChars: event.inputChars,
          promptTokens: event.promptTokens ?? null,
          completionTokens: event.completionTokens ?? null,
          latencyMs: Math.round(event.latencyMs),
          totalDurationMs: event.totalDurationMs ?? null,
          loadDurationMs: event.loadDurationMs ?? null,
          promptEvalMs: event.promptEvalMs ?? null,
          evalMs: event.evalMs ?? null,
          tokensPerSecond: event.tokensPerSecond ?? null,
        },
      })
      .catch((error: unknown) => console.error("Failed to record LLM call metrics:", error));
  });
}
