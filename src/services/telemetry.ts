export type LlmOperation = "rag_answer" | "direct_answer" | "file_summary" | "commit_summary" | "breaking_change" | "embedding";

export interface LlmCallEvent {
  projectId?: string;
  operation: LlmOperation;
  /** ollama | gemini | groq. Defaults to ollama (embeddings are always local). */
  provider?: string;
  model: string;
  success: boolean;
  error?: string;
  inputChars: number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  totalDurationMs?: number;
  loadDurationMs?: number;
  promptEvalMs?: number;
  evalMs?: number;
  tokensPerSecond?: number;
}

/** Raw timing fields returned by Ollama (durations in nanoseconds). */
export interface OllamaTimings {
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

const nsToMs = (ns: number | undefined) => (typeof ns === "number" ? Math.round(ns / 1e6) : undefined);

export function timingsToMetrics(t: OllamaTimings | undefined): Partial<LlmCallEvent> {
  if (!t) return {};
  const tokensPerSecond =
    t.eval_count && t.eval_duration ? Math.round((t.eval_count / (t.eval_duration / 1e9)) * 10) / 10 : undefined;
  return {
    promptTokens: t.prompt_eval_count,
    completionTokens: t.eval_count,
    totalDurationMs: nsToMs(t.total_duration),
    loadDurationMs: nsToMs(t.load_duration),
    promptEvalMs: nsToMs(t.prompt_eval_duration),
    evalMs: nsToMs(t.eval_duration),
    tokensPerSecond,
  };
}

type Listener = (event: LlmCallEvent) => void;
const listeners = new Set<Listener>();

export function onLlmCall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLlmCall(event: LlmCallEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Telemetry must never break the request that produced it.
    }
  }
}
