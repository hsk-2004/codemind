import { readLines } from "@/lib/stream-lines";
import { timingsToMetrics, type OllamaTimings } from "../telemetry";
import { llmConfig, ollamaHeaders } from "./config";
import { BaseProvider, type CompletionMetrics, type GenerateOptions, type StreamChunk } from "./provider";

interface OllamaChatResponse extends OllamaTimings {
  message: { role: string; content: string };
  done: boolean;
}

/** Local models served by Ollama. */
export class OllamaProvider extends BaseProvider {
  readonly id = "ollama" as const;

  constructor(
    private readonly baseUrl: string = llmConfig.baseUrl,
    model: string = llmConfig.model,
  ) {
    super(model);
  }

  protected async request(prompt: string, options: GenerateOptions): Promise<{ text: string; metrics: CompletionMetrics }> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaHeaders() },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.system ? [{ role: "system", content: options.system }] : []),
          { role: "user", content: prompt },
        ],
        stream: false,
        ...(options.json ? { format: "json" } : {}),
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 512,
          num_ctx: llmConfig.numCtx,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama generate failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    return { text: data.message.content, metrics: timingsToMetrics(data) };
  }

  protected async *streamRequest(prompt: string, options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaHeaders() },
      signal: options.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.system ? [{ role: "system", content: options.system }] : []),
          { role: "user", content: prompt },
        ],
        stream: true,
        ...(options.json ? { format: "json" } : {}),
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 512,
          num_ctx: llmConfig.numCtx,
        },
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama generate failed: ${res.status} ${res.statusText}`);

    // One JSON object per line; the last one (done: true) carries the timings.
    for await (const line of readLines(res.body)) {
      if (!line.trim()) continue;
      const data = JSON.parse(line) as OllamaChatResponse & { error?: string };
      if (data.error) throw new Error(`Ollama: ${data.error}`);
      if (data.message?.content) yield { text: data.message.content };
      if (data.done) yield { metrics: timingsToMetrics(data) };
    }
  }
}
