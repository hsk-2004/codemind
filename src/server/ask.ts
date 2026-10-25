import type { PrismaClient } from "@prisma/client";
import { isDeclined, wordCount, type AnswerMeta, type AnswerMode, type AskEvent, type EscalationSuggestion, type FileReference, type ModelRef } from "@/lib/ask-types";
import { syncActiveModel } from "@/server/model-settings";
import { getLangChainEmbeddings } from "@/services/embedding";
import { PROVIDER_INFO, isProviderConfigured, type ModelSelection } from "@/services/llm";
import { listAvailableModels } from "@/services/llm/catalog";
import { cloudConfig, embeddingConfig, llmConfig } from "@/services/llm/config";
import { createAnswerModel } from "@/services/llm/langchain";
import type { CompletionMetrics } from "@/services/llm/provider";
import { NO_CONTEXT_ANSWER, contextLimitsFor, createDirectStream, createRagStream, type SourceDocument } from "@/services/rag/chain";
import { ESCALATION_REASONS, escalationReason, modelTiers } from "@/services/rag/escalation";
import { retrievalQuery, trimHistory, type ChatTurn } from "@/services/rag/history";
import { RAG_PROMPT_VERSION } from "@/services/rag/prompt";
import { createProjectRetriever } from "@/services/rag/retriever";
import { emitLlmCall, type LlmOperation } from "@/services/telemetry";

export interface AskInput {
  question: string;
  projectId: string;
  mode: AnswerMode;
  /** Earlier turns of the conversation, for follow-up questions. */
  history?: ChatTurn[];
  /** Ask this model instead of the one selected in the app (used to compare models). */
  model?: ModelSelection;
  signal?: AbortSignal;
}

const modelRef = (selection: ModelSelection): ModelRef => ({
  provider: selection.provider,
  providerLabel: PROVIDER_INFO[selection.provider].label,
  location: PROVIDER_INFO[selection.provider].location,
  model: selection.model,
});

interface Generation {
  answer: string;
  firstTokenAt?: number;
  metrics: Partial<CompletionMetrics>;
}

/** Throws unless the project exists and belongs to the user. Checked before any streaming starts. */
export async function assertAskAccess(db: PrismaClient, userId: string, projectId: string) {
  const membership = await db.userToProject.findFirst({
    where: { userId, projectId, project: { deletedAt: null } },
    select: { project: { select: { name: true, githubUrl: true } } },
  });
  if (!membership) throw new Error("You do not have access to this project");
  return membership.project;
}

/** A model chosen for a comparison must be configured and actually offered by its provider. */
export async function assertModelAvailable(selection: ModelSelection) {
  if (!isProviderConfigured(selection.provider)) {
    throw new Error(`${PROVIDER_INFO[selection.provider].label} is not configured. Add its API key to .env and restart.`);
  }
  const entry = (await listAvailableModels()).find((c) => c.provider === selection.provider);
  if (entry && entry.models.length > 0 && !entry.models.some((m) => m.model === selection.model)) {
    throw new Error(`Model "${selection.model}" is not available from ${PROVIDER_INFO[selection.provider].label}.`);
  }
}

/**
 * Runs one model over the question and yields each piece of the answer as it is
 * written. The finished call is recorded in telemetry, success or failure.
 * Its return value is the whole generation.
 */
async function* generate(
  selection: ModelSelection,
  operation: LlmOperation,
  projectId: string,
  question: string,
  open: (model: ReturnType<typeof createAnswerModel>) => Promise<AsyncIterable<string>>,
  signal?: AbortSignal,
): AsyncGenerator<AskEvent, Generation> {
  const model = createAnswerModel(selection);
  const started = Date.now();
  let answer = "";
  let firstTokenAt: number | undefined;
  try {
    for await (const piece of await open(model)) {
      if (!piece) continue;
      firstTokenAt ??= Date.now();
      answer += piece;
      yield { type: "token", text: piece };
    }
    answer = answer.trim();
    if (!answer) throw new Error("The model returned an empty answer.");
    const metrics = model.getMetrics();
    emitLlmCall({ projectId, operation, provider: selection.provider, model: selection.model, success: true, inputChars: question.length, latencyMs: Date.now() - started, ...metrics });
    return { answer, firstTokenAt, metrics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitLlmCall({ projectId, operation, provider: selection.provider, model: selection.model, success: false, error: (signal?.aborted ? "cancelled" : message).slice(0, 500), inputChars: question.length, latencyMs: Date.now() - started });
    if (signal?.aborted) throw error;
    const info = PROVIDER_INFO[selection.provider];
    // Cloud errors (rate limit, overloaded model) are worth showing as they are.
    throw new Error(
      info.location === "cloud" ? `${info.label} (${selection.model}) failed: ${message}` : "The local model did not respond. Make sure Ollama is running, then try again.",
    );
  }
}

const toReference = (doc: SourceDocument): FileReference => ({
  fileName: doc.metadata.source,
  sourceCode: doc.pageContent,
  summary: doc.metadata.summary,
  similarity: doc.metadata.score,
});

/**
 * The whole answer pipeline as a stream of events: sources as soon as retrieval
 * finishes, then the answer word by word, then the final metadata.
 */
export async function* runAsk(db: PrismaClient, userId: string, input: AskInput): AsyncGenerator<AskEvent> {
  const { projectId, mode, signal } = input;
  const project = await assertAskAccess(db, userId, projectId);

  const question = input.question.trim();
  if (!question) throw new Error("Question cannot be empty");
  const history = trimHistory(input.history);

  const active = input.model ?? (await syncActiveModel(db));
  if (input.model) await assertModelAvailable(input.model);
  const started = Date.now();

  let sources: SourceDocument[] = [];
  let retrievalMs = 0;
  let retrievalLevel: "function" | "file" | undefined;
  let retrievalMode: "vector" | "hybrid" | undefined;
  if (mode !== "direct") {
    // Chunks retrieved per question, sized to each model's context budget.
    const chunkCount = active.provider === "ollama" ? 6 : active.provider === "groq" ? 8 : 16;
    const retriever = await createProjectRetriever(db, getLangChainEmbeddings(projectId), projectId, chunkCount);
    retrievalLevel = retriever.level;
    retrievalMode = retriever.mode;
    // A follow-up is searched together with the question before it.
    sources = await retriever.retrieve(retrievalQuery(history, question));
    retrievalMs = Date.now() - started;
  }
  const filesReferences = sources.map(toReference);
  yield { type: "sources", filesReferences, retrievalMs };

  const tiers = modelTiers(active.provider === "ollama" ? active.model : llmConfig.model, {
    groq: isProviderConfigured("groq") ? cloudConfig.groqDefaultModel : undefined,
    gemini: isProviderConfigured("gemini") ? cloudConfig.geminiDefaultModel : undefined,
  });
  let used: ModelSelection = active;
  let result: Generation | null = null;
  let suggestion: EscalationSuggestion | undefined;
  let keptLocalReason: string | undefined;

  const ragStream = (selection: ModelSelection) => (model: ReturnType<typeof createAnswerModel>) =>
    Promise.resolve(createRagStream({ llm: model.llm, callbacks: model.callbacks, limits: contextLimitsFor(selection.provider) })(sources, question, { history, signal }));

  if (mode === "direct") {
    result = yield* generate(
      active,
      "direct_answer",
      projectId,
      question,
      (model) => Promise.resolve(createDirectStream({ llm: model.llm, callbacks: model.callbacks })(question, `${project.name} (${project.githubUrl})`, { history, signal })),
      signal,
    );
  } else if (sources.length > 0 && mode === "rag") {
    result = yield* generate(active, "rag_answer", projectId, question, ragStream(active), signal);
  } else if (sources.length > 0 && mode === "auto") {
    // Smallest tier first: the selected local model, or the default one if a cloud model is selected.
    used = tiers[0]!;
    result = yield* generate(used, "rag_answer", projectId, question, ragStream(used), signal);
    const reason = escalationReason(result.answer, sources);
    const next = tiers[1];
    // Nothing is sent to the cloud here: the user approves scaling up with a button.
    if (next) suggestion = { to: modelRef(next), reason: reason ? ESCALATION_REASONS[reason] : undefined };
    else if (reason) keptLocalReason = `The answer looks weak because ${ESCALATION_REASONS[reason]}, but no cloud model is configured to scale up to.`;
  } else if (sources.length > 0) {
    // 'escalate': the user approved re-asking on a larger model. Try the cloud tiers in order.
    const larger = tiers.slice(1);
    if (larger.length === 0) throw new Error("No cloud model is configured. Add GEMINI_API_KEY or GROQ_API_KEY to scale up.");
    let lastError: unknown;
    for (const tier of larger) {
      try {
        result = yield* generate(tier, "rag_escalation", projectId, question, ragStream(tier), signal);
        used = tier;
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
      }
    }
    if (!result) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  const output = result?.answer ?? NO_CONTEXT_ANSWER;
  if (!result) yield { type: "token", text: output };

  const totalMs = Date.now() - started;
  const meta: AnswerMeta = {
    mode,
    ...modelRef(used),
    embeddingModel: embeddingConfig.model,
    promptVersion: RAG_PROMPT_VERSION,
    retrievalMs,
    generationMs: result ? totalMs - retrievalMs : 0,
    totalMs,
    firstTokenMs: result?.firstTokenAt ? result.firstTokenAt - started : undefined,
    sourcesUsed: sources.length,
    retrievalLevel,
    retrievalMode,
    // Retrieved sources the model refused to use are not grounding.
    grounded: sources.length > 0 && !isDeclined(output),
    historyTurns: history.length,
    answerChars: output.length,
    answerWords: wordCount(output),
    suggestion,
    keptLocalReason,
    ...(result?.metrics ?? {}),
  };
  console.log(JSON.stringify({ event: "answer", projectId, ...meta, suggestion: suggestion ? { to: suggestion.to.model, reason: suggestion.reason } : undefined }));
  yield { type: "done", output, filesReferences, meta };
}
