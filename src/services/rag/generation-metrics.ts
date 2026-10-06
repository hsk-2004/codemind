import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { timingsToMetrics, type LlmCallEvent, type OllamaTimings } from "../telemetry";

type GenerationMetrics = Pick<
  LlmCallEvent,
  "promptTokens" | "completionTokens" | "totalDurationMs" | "loadDurationMs" | "promptEvalMs" | "evalMs" | "tokensPerSecond"
>;

/** LangChain callback that captures Ollama's token counts and timings from ChatOllama. */
export class GenerationMetricsHandler extends BaseCallbackHandler {
  name = "codemind_generation_metrics";
  metrics: GenerationMetrics | null = null;

  override handleLLMEnd(output: LLMResult): void {
    const generation = output.generations[0]?.[0] as { message?: { response_metadata?: OllamaTimings } } | undefined;
    const metadata = generation?.message?.response_metadata;
    if (metadata) this.metrics = timingsToMetrics(metadata);
  }
}
