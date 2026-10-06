import { cloudConfig, embeddingConfig, llmConfig, ollamaHeaders } from "./config";
import { GEMINI_API_BASE } from "./gemini";
import { GROQ_API_BASE } from "./groq";
import type { ProviderId } from "./provider";

export interface CatalogModel {
  provider: ProviderId;
  model: string;
  /** Extra detail shown in the picker, e.g. size on disk. */
  note?: string;
}

export interface ProviderCatalog {
  provider: ProviderId;
  configured: boolean;
  models: CatalogModel[];
  error?: string;
}

/** Gemini variants that are not general text chat models. */
const GEMINI_EXCLUDE = /(tts|image|audio|live|embedding|transcribe|robotics|computer-use|customtools|omni|aqa|learnlm)/i;

/** Groq hosts speech, moderation and voice models too; only chat models can answer questions. */
const GROQ_EXCLUDE = /(whisper|guard|orpheus|tts|distil|playai)/i;

/** Ollama models that produce embeddings rather than text. */
const EMBEDDING_NAME = /(embed|bge|minilm|e5-)/i;

export function isGeminiChatModel(name: string, methods: string[] = ["generateContent"]): boolean {
  return name.startsWith("gemini") && methods.includes("generateContent") && !GEMINI_EXCLUDE.test(name);
}

export function isGroqChatModel(id: string): boolean {
  return !GROQ_EXCLUDE.test(id);
}

export function isOllamaChatModel(name: string): boolean {
  const base = name.replace(/:latest$/, "");
  return base !== embeddingConfig.model && !EMBEDDING_NAME.test(name);
}

const timeout = () => AbortSignal.timeout(8000);
const formatSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

async function listOllama(): Promise<ProviderCatalog> {
  try {
    const res = await fetch(`${llmConfig.baseUrl}/api/tags`, { headers: ollamaHeaders(), signal: timeout() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models: { name: string; size: number }[] };
    const models = data.models
      .filter((m) => isOllamaChatModel(m.name))
      .map((m) => ({ provider: "ollama" as const, model: m.name.replace(/:latest$/, ""), note: formatSize(m.size) }))
      .sort((a, b) => a.model.localeCompare(b.model));
    return { provider: "ollama", configured: true, models };
  } catch (error) {
    return { provider: "ollama", configured: true, models: [], error: `Ollama is not reachable (${String(error)})` };
  }
}

async function listGemini(): Promise<ProviderCatalog> {
  if (!cloudConfig.geminiApiKey) return { provider: "gemini", configured: false, models: [] };
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?pageSize=200`, {
      headers: { "x-goog-api-key": cloudConfig.geminiApiKey },
      signal: timeout(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const models = (data.models ?? [])
      .map((m) => ({ name: m.name.replace(/^models\//, ""), methods: m.supportedGenerationMethods }))
      .filter((m) => isGeminiChatModel(m.name, m.methods))
      .map((m) => ({ provider: "gemini" as const, model: m.name }))
      .sort((a, b) => b.model.localeCompare(a.model, undefined, { numeric: true }));
    return { provider: "gemini", configured: true, models };
  } catch (error) {
    return { provider: "gemini", configured: true, models: [], error: `Could not list Gemini models (${String(error)})` };
  }
}

async function listGroq(): Promise<ProviderCatalog> {
  if (!cloudConfig.groqApiKey) return { provider: "groq", configured: false, models: [] };
  try {
    const res = await fetch(`${GROQ_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${cloudConfig.groqApiKey}` },
      signal: timeout(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id: string; active?: boolean }[] };
    const models = (data.data ?? [])
      .filter((m) => m.active !== false && isGroqChatModel(m.id))
      .map((m) => ({ provider: "groq" as const, model: m.id }))
      .sort((a, b) => a.model.localeCompare(b.model));
    return { provider: "groq", configured: true, models };
  } catch (error) {
    return { provider: "groq", configured: true, models: [], error: `Could not list Groq models (${String(error)})` };
  }
}

let cache: { at: number; value: ProviderCatalog[] } | null = null;
const CACHE_MS = 60_000;

/** Lists the chat models available from each provider. Results are cached for a minute. */
export async function listAvailableModels(refresh = false): Promise<ProviderCatalog[]> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await Promise.all([listOllama(), listGemini(), listGroq()]);
  cache = { at: Date.now(), value };
  return value;
}
