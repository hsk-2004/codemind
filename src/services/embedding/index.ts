import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { embeddingConfig } from "../llm/config";
import { emitLlmCall } from "../telemetry";
import { OllamaEmbeddingProvider } from "./ollama";
import type { EmbeddingProvider } from "./provider";

let instance: OllamaEmbeddingProvider | null = null;

function getOllamaProvider(): OllamaEmbeddingProvider {
  if (instance) return instance;
  switch (embeddingConfig.provider) {
    case "ollama":
      instance = new OllamaEmbeddingProvider();
      return instance;
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${embeddingConfig.provider}`);
  }
}

async function timedEmbed<T>(texts: string[], projectId: string | undefined, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const base = {
    projectId,
    operation: "embedding" as const,
    model: embeddingConfig.model,
    inputChars: texts.reduce((n, t) => n + t.length, 0),
  };
  try {
    const result = await run();
    // Ollama's embedding endpoint reports no token timings, so only wall-clock latency is recorded.
    emitLlmCall({ ...base, success: true, latencyMs: Date.now() - started });
    return result;
  } catch (error) {
    emitLlmCall({ ...base, success: false, error: String(error).slice(0, 500), latencyMs: Date.now() - started });
    throw error;
  }
}

export function getEmbeddingProvider(projectId?: string): EmbeddingProvider {
  const provider = getOllamaProvider();
  return {
    embed: (text) => timedEmbed([text], projectId, () => provider.embed(text)),
  };
}

/** LangChain embeddings for use inside LangChain pipelines, with call metrics. */
export function getLangChainEmbeddings(projectId?: string): EmbeddingsInterface {
  const embeddings = getOllamaProvider().embeddings;
  return {
    embedQuery: (text) => timedEmbed([text], projectId, () => embeddings.embedQuery(text)),
    embedDocuments: (texts) => timedEmbed(texts, projectId, () => embeddings.embedDocuments(texts)),
  };
}

export type { EmbeddingProvider } from "./provider";
