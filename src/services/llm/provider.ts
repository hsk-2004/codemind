import { emitLlmCall, type LlmCallEvent, type LlmOperation } from "../telemetry";

export type ProviderId = "ollama" | "gemini" | "groq";

export const PROVIDER_INFO: Record<ProviderId, { label: string; location: "local" | "cloud" }> = {
  ollama: { label: "Ollama", location: "local" },
  gemini: { label: "Google Gemini", location: "cloud" },
  groq: { label: "Groq", location: "cloud" },
};

export interface ModelSelection {
  provider: ProviderId;
  model: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** Force JSON output (grammar-constrained on Ollama, JSON mode on cloud providers). */
  json?: boolean;
  /** Optional system instruction, kept separate from the user prompt. */
  system?: string;
  /** Telemetry labels for the Metrics dashboard; calls without an operation are not recorded. */
  operation?: LlmOperation;
  projectId?: string;
}

/** Token counts and timings for one completion, as far as the provider reports them. */
export type CompletionMetrics = Pick<
  LlmCallEvent,
  "promptTokens" | "completionTokens" | "totalDurationMs" | "loadDurationMs" | "promptEvalMs" | "evalMs" | "tokensPerSecond"
>;

export interface Completion {
  text: string;
  metrics: CompletionMetrics;
  latencyMs: number;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly model: string;
  /** Full completion with metrics. Emits a telemetry event when `options.operation` is set. */
  complete(prompt: string, options?: GenerateOptions): Promise<Completion>;
  /** Convenience wrapper returning only the text. */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
}

/** Shared timing and telemetry for all providers; subclasses implement `request`. */
export abstract class BaseProvider implements LLMProvider {
  abstract readonly id: ProviderId;

  constructor(readonly model: string) {}

  protected abstract request(prompt: string, options: GenerateOptions): Promise<{ text: string; metrics: CompletionMetrics }>;

  async complete(prompt: string, options: GenerateOptions = {}): Promise<Completion> {
    const started = Date.now();
    const base = {
      projectId: options.projectId,
      operation: options.operation ?? ("commit_summary" as const),
      provider: this.id,
      model: this.model,
      inputChars: prompt.length + (options.system?.length ?? 0),
    };
    try {
      const { text, metrics } = await this.request(prompt, options);
      const latencyMs = Date.now() - started;
      // Some cloud APIs report token counts but no timings. Fall back to
      // end-to-end throughput (includes network time and any hidden reasoning).
      if (this.id !== "ollama" && metrics.tokensPerSecond === undefined && metrics.completionTokens && latencyMs > 0) {
        metrics.tokensPerSecond = Math.round((metrics.completionTokens / (latencyMs / 1000)) * 10) / 10;
      }
      if (options.operation) emitLlmCall({ ...base, success: true, latencyMs, ...metrics });
      return { text: text.trim(), metrics, latencyMs };
    } catch (error) {
      if (options.operation) {
        emitLlmCall({ ...base, success: false, error: String(error).slice(0, 500), latencyMs: Date.now() - started });
      }
      throw error;
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    return (await this.complete(prompt, options)).text;
  }
}
