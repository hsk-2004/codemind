const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/+$/, "");

export const llmConfig = {
  provider: process.env.LLM_PROVIDER ?? "ollama",
  model: process.env.LLM_MODEL ?? "qwen2.5-coder:3b-instruct",
  numCtx: Number(process.env.LLM_NUM_CTX ?? 3072),
  baseUrl,
};

export const embeddingConfig = {
  provider: process.env.EMBEDDING_PROVIDER ?? "ollama",
  model: process.env.EMBEDDING_MODEL ?? "nomic-embed-text",
  baseUrl,
};

/**
 * Extra headers for every Ollama request. When Ollama is exposed remotely
 * (e.g. laptop behind a tunnel), the gateway requires this bearer token.
 */
export function ollamaHeaders(): Record<string, string> {
  const key = process.env.OLLAMA_API_KEY?.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Optional cloud providers. A provider is offered in the model picker only when its key is set. */
export const cloudConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
  groqApiKey: process.env.GROQ_API_KEY?.trim() ?? "",
  geminiDefaultModel: process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest",
  groqDefaultModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
  /** Per-request timeout for cloud calls, so an overloaded model fails fast instead of hanging. */
  requestTimeoutMs: Number(process.env.CLOUD_REQUEST_TIMEOUT_MS ?? 60_000),
};
