export type LlmOperation = "rag_answer" | "rag_escalation" | "direct_answer" | "file_summary" | "commit_summary" | "breaking_change" | "embedding" | "file_explanation";

/** One message of a chat prompt, as it was sent to a model. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

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
  /** Milliseconds from the call starting to the first word of the reply. */
  firstTokenMs?: number;
  /** What was sent to the model: the chat messages, or plain text. Used for tracing only. */
  input?: string | ChatMessage[];
  /** What came back: the reply text. Used for tracing only. */
  output?: string;
  /** Extra facts for tracing, such as how many texts an embedding call covered. */
  metadata?: Record<string, string | number | boolean>;
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

// Kept on globalThis so listeners survive a hot reload in development, when this module is evaluated again.
const globalForListeners = globalThis as unknown as { codemindLlmListeners?: Set<Listener> };
const listeners = (globalForListeners.codemindLlmListeners ??= new Set<Listener>());

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
