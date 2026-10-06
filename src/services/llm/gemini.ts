import { cloudConfig } from "./config";
import { BaseProvider, type CompletionMetrics, type GenerateOptions } from "./provider";
import { fetchWithRetry, providerError, type RetryOptions } from "./retry";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

/**
 * Gemini models "think" before answering and the thinking counts against the
 * output limit, so a tight limit can cut the visible answer off. Thinking
 * options differ between models, so instead of configuring them the request
 * simply leaves extra room.
 */
const THINKING_HEADROOM_TOKENS = 4096;

/** Google Gemini (cloud). Prompts and repository code are sent to Google. */
export class GeminiProvider extends BaseProvider {
  readonly id = "gemini" as const;

  constructor(
    model: string,
    private readonly apiKey: string = cloudConfig.geminiApiKey,
    private readonly retry: RetryOptions = { timeoutMs: cloudConfig.requestTimeoutMs },
  ) {
    super(model);
  }

  protected async request(prompt: string, options: GenerateOptions): Promise<{ text: string; metrics: CompletionMetrics }> {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not set");

    const res = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: (options.maxTokens ?? 512) + THINKING_HEADROOM_TOKENS,
            ...(options.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
      this.retry,
    );
    if (!res.ok) throw await providerError("Gemini", res);

    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");

    if (!text.trim()) {
      const reason = data.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no content";
      throw new Error(`Gemini returned an empty answer (${reason})`);
    }

    // Gemini reports token counts but no timings; speed is derived from wall-clock time by the caller.
    return {
      text,
      metrics: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
