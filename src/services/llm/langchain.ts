import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { ChatPromptValueInterface } from "@langchain/core/prompt_values";
import { RunnableLambda, type RunnableLike } from "@langchain/core/runnables";
import { ChatOllama } from "@langchain/ollama";
import { GenerationMetricsHandler } from "../rag/generation-metrics";
import { llmConfig, ollamaHeaders } from "./config";
import { createProvider } from "./index";
import type { CompletionMetrics, ModelSelection } from "./provider";

const ANSWER_MAX_TOKENS = 1024;
const chatModels = new Map<string, ChatOllama>();

/** LangChain chat model backed by the local Ollama server. */
export function getChatModel(model: string = llmConfig.model): ChatOllama {
  let chat = chatModels.get(model);
  if (!chat) {
    chat = new ChatOllama({
      baseUrl: llmConfig.baseUrl,
      model,
      temperature: 0.2,
      numCtx: llmConfig.numCtx,
      numPredict: ANSWER_MAX_TOKENS,
      headers: ollamaHeaders(),
    });
    chatModels.set(model, chat);
  }
  return chat;
}

export interface AnswerModel {
  /** Plugs into a LangChain sequence after the prompt template. */
  llm: RunnableLike;
  callbacks?: Callbacks;
  /** Token counts and timings of the last generation, if the provider reported any. */
  getMetrics(): CompletionMetrics;
}

/**
 * Returns the selected model as a LangChain runnable.
 * Local models use LangChain's ChatOllama. Cloud models go through CodeMind's
 * own provider classes, wrapped so they fit the same chain.
 */
export function createAnswerModel(selection: ModelSelection): AnswerModel {
  if (selection.provider === "ollama") {
    const handler = new GenerationMetricsHandler();
    return { llm: getChatModel(selection.model), callbacks: [handler], getMetrics: () => handler.metrics ?? {} };
  }

  const provider = createProvider(selection);
  let metrics: CompletionMetrics = {};
  const llm = RunnableLambda.from(async (prompt: ChatPromptValueInterface) => {
    const messages = prompt.toChatMessages();
    const textOf = (type: string) =>
      messages
        .filter((m) => m.getType() === type)
        .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
        .join("\n\n");
    const completion = await provider.complete(textOf("human"), {
      system: textOf("system") || undefined,
      temperature: 0.2,
      maxTokens: ANSWER_MAX_TOKENS,
    });
    metrics = completion.metrics;
    return completion.text;
  });
  return { llm, getMetrics: () => metrics };
}
