import { OllamaEmbeddings } from "@langchain/ollama";
import { embeddingConfig, ollamaHeaders } from "../llm/config";
import type { EmbeddingProvider } from "./provider";

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly embeddings: OllamaEmbeddings;

  constructor(baseUrl: string = embeddingConfig.baseUrl, model: string = embeddingConfig.model) {
    this.embeddings = new OllamaEmbeddings({ baseUrl, model, headers: ollamaHeaders() });
  }

  async embed(text: string): Promise<number[] | null> {
    if (!text.trim()) return null;
    try {
      const vector = await this.embeddings.embedQuery(text);
      return vector.length > 0 ? vector : null;
    } catch (error) {
      console.error("Failed to generate embedding:", error);
      return null;
    }
  }
}
