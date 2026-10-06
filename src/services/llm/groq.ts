import { cloudConfig } from "./config";
import { BaseProvider, type CompletionMetrics, type GenerateOptions } from "./provider";
import { fetchWithRetry, providerError, type RetryOptions } from "./retry";

export const GROQ_API_BASE = "https://api.groq.com/openai/v1";

interface GroqResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_time?: number;
    completion_time?: number;
    total_time?: number;
    queue_time?: number;
  };
}

/** Some Groq models reason before answering; reasoning tokens count against the limit. */
const REASONING_HEADROOM_TOKENS = 2048;

const secondsToMs = (s: number | undefined) => (typeof s === "number" ? Math.round(s * 1000) : undefined);

/** Groq (cloud, OpenAI-compatible API). Prompts and repository code are sent to Groq. */
export class GroqProvider extends BaseProvider {
  readonly id = "groq" as const;

  constructor(
    model: string,
    private readonly apiKey: string = cloudConfig.groqApiKey,
    private readonly retry: RetryOptions = { timeoutMs: cloudConfig.requestTimeoutMs },
  ) {
    super(model);
  }

  protected async request(prompt: string, options: GenerateOptions): Promise<{ text: string; metrics: CompletionMetrics }> {
    if (!this.apiKey) throw new Error("GROQ_API_KEY is not set");

    const res = await fetchWithRetry(
      `${GROQ_API_BASE}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...(options.system ? [{ role: "system", content: options.system }] : []),
            { role: "user", content: prompt },
          ],
          temperature: options.temperature ?? 0.2,
          max_tokens: (options.maxTokens ?? 512) + REASONING_HEADROOM_TOKENS,
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      this.retry,
    );
    if (!res.ok) throw await providerError("Groq", res);

    const data = (await res.json()) as GroqResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new Error(`Groq returned an empty answer (${data.choices?.[0]?.finish_reason ?? "no content"})`);
    }

    const usage = data.usage ?? {};
    const tokensPerSecond =
      usage.completion_tokens && usage.completion_time
        ? Math.round((usage.completion_tokens / usage.completion_time) * 10) / 10
        : undefined;

    return {
      text,
      metrics: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        promptEvalMs: secondsToMs(usage.prompt_time),
        evalMs: secondsToMs(usage.completion_time),
        totalDurationMs: secondsToMs(usage.total_time),
        tokensPerSecond,
      },
    };
  }
}
