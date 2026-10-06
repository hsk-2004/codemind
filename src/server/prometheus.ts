import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { LlmCallEvent } from "@/services/telemetry";

function createRegistry() {
  const registry = new Registry();
  registry.setDefaultLabels({ app: "codemind" });
  collectDefaultMetrics({ register: registry, prefix: "codemind_" });

  const labels = ["operation", "provider", "model"] as const;

  return {
    registry,
    calls: new Counter({
      name: "codemind_llm_calls_total",
      help: "Calls to local AI models",
      labelNames: [...labels, "status"],
      registers: [registry],
    }),
    tokens: new Counter({
      name: "codemind_llm_tokens_total",
      help: "Tokens processed by the local LLM",
      labelNames: [...labels, "type"],
      registers: [registry],
    }),
    latency: new Histogram({
      name: "codemind_llm_latency_seconds",
      help: "Wall-clock latency of local AI model calls",
      labelNames: [...labels],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 40, 60, 120],
      registers: [registry],
    }),
    speed: new Histogram({
      name: "codemind_llm_tokens_per_second",
      help: "Generation speed reported by Ollama",
      labelNames: [...labels],
      buckets: [2, 5, 10, 15, 20, 30, 40, 60, 80, 120],
      registers: [registry],
    }),
    loadTime: new Histogram({
      name: "codemind_llm_model_load_seconds",
      help: "Time Ollama spent loading the model into memory before answering",
      labelNames: [...labels],
      buckets: [0.01, 0.1, 0.5, 1, 5, 10, 30, 60, 120],
      registers: [registry],
    }),
  };
}

type Metrics = ReturnType<typeof createRegistry>;
const globalForMetrics = globalThis as unknown as { codemindMetrics?: Metrics };

// Reused across hot reloads so metrics are not registered twice.
export const metrics: Metrics = (globalForMetrics.codemindMetrics ??= createRegistry());

export function recordPrometheus(event: LlmCallEvent): void {
  const labels = { operation: event.operation, provider: event.provider ?? "ollama", model: event.model };
  metrics.calls.inc({ ...labels, status: event.success ? "success" : "error" });
  metrics.latency.observe(labels, event.latencyMs / 1000);
  if (event.promptTokens) metrics.tokens.inc({ ...labels, type: "prompt" }, event.promptTokens);
  if (event.completionTokens) metrics.tokens.inc({ ...labels, type: "completion" }, event.completionTokens);
  if (event.tokensPerSecond) metrics.speed.observe(labels, event.tokensPerSecond);
  if (event.loadDurationMs !== undefined) metrics.loadTime.observe(labels, event.loadDurationMs / 1000);
}
