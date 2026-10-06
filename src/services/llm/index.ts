import { cloudConfig, llmConfig } from "./config";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OllamaProvider } from "./ollama";
import type { LLMProvider, ModelSelection, ProviderId } from "./provider";

/** The model used when nothing has been chosen in the app: the local one from the environment. */
export function defaultModelSelection(): ModelSelection {
  return { provider: "ollama", model: llmConfig.model };
}

const globalForModel = globalThis as unknown as { codemindActiveModel?: ModelSelection };

/** The chat model currently selected in the app. Embeddings always stay local. */
export function getActiveModel(): ModelSelection {
  return globalForModel.codemindActiveModel ?? defaultModelSelection();
}

export function setActiveModel(selection: ModelSelection): void {
  globalForModel.codemindActiveModel = selection;
}

export function isProviderConfigured(provider: ProviderId): boolean {
  if (provider === "gemini") return cloudConfig.geminiApiKey.length > 0;
  if (provider === "groq") return cloudConfig.groqApiKey.length > 0;
  return true;
}

export function createProvider({ provider, model }: ModelSelection): LLMProvider {
  switch (provider) {
    case "ollama":
      return new OllamaProvider(llmConfig.baseUrl, model);
    case "gemini":
      return new GeminiProvider(model);
    case "groq":
      return new GroqProvider(model);
    default:
      throw new Error(`Unknown LLM provider: ${String(provider)}`);
  }
}

/** Provider for the currently selected model. */
export function getLLMProvider(): LLMProvider {
  return createProvider(getActiveModel());
}

export type { Completion, GenerateOptions, LLMProvider, ModelSelection, ProviderId } from "./provider";
export { PROVIDER_INFO } from "./provider";
