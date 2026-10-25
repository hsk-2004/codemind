import type { PrismaClient } from "@prisma/client";
import type { ExplainEvent, ExplainMeta, FileSymbol } from "@/lib/ask-types";
import { syncActiveModel } from "@/server/model-settings";
import { PROVIDER_INFO } from "@/services/llm";
import { createAnswerModel } from "@/services/llm/langchain";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { languageFor, listSymbols } from "@/services/rag/chunking";
import { contextLimitsFor } from "@/services/rag/chain";
import { explainPrompt } from "@/services/rag/explain-prompt";
import { emitLlmCall } from "@/services/telemetry";

/** The part of a file the model will read: all of it when it fits, otherwise the beginning, cut at a line. */
export function codeForModel(code: string, maxChars: number): { text: string; truncated: boolean; shownLines: number } {
  if (code.length <= maxChars) return { text: code, truncated: false, shownLines: code.split("\n").length };
  const cut = code.slice(0, maxChars);
  const text = cut.slice(0, Math.max(cut.lastIndexOf("\n"), 1));
  return { text, truncated: true, shownLines: text.split("\n").length };
}

/** Looks the file up and checks that the user may read it. Done before streaming starts. */
export async function loadFileForExplain(db: PrismaClient, userId: string, fileId: string) {
  const file = await db.sourceCodeEmbedding.findUnique({ where: { id: fileId }, select: { id: true, fileName: true, sourceCode: true, projectId: true } });
  if (!file) return { status: 404 as const, error: "File not found" };
  const member = await db.userToProject.findFirst({ where: { userId, projectId: file.projectId, project: { deletedAt: null } }, select: { id: true } });
  if (!member) return { status: 403 as const, error: "You do not have access to this project" };
  return { status: 200 as const, file };
}

/** Explains a file: its functions at once, then a plain-language explanation written live. */
export async function* runExplain(db: PrismaClient, file: { fileName: string; sourceCode: string; projectId: string }, signal?: AbortSignal): AsyncGenerator<ExplainEvent> {
  const symbols: FileSymbol[] = listSymbols(file.sourceCode);
  yield { type: "outline", fileName: file.fileName, language: languageFor(file.fileName), lines: file.sourceCode.split("\n").length, symbols };

  const active = await syncActiveModel(db);
  const limits = contextLimitsFor(active.provider);
  // Leave room for the prompt and the answer: a local model has a small window.
  const code = codeForModel(file.sourceCode, Math.floor(limits.maxTotalChars * (active.provider === "ollama" ? 0.75 : 0.9)));
  const names = [...new Set(symbols.map((s) => s.name))].slice(0, 40).join(", ") || "none found";

  const model = createAnswerModel(active);
  const started = Date.now();
  let output = "";
  let firstTokenAt: number | undefined;
  const base = { projectId: file.projectId, operation: "file_explanation" as const, provider: active.provider, model: active.model, inputChars: code.text.length };
  try {
    const chain = RunnableSequence.from([explainPrompt, model.llm, new StringOutputParser()]).withConfig({ callbacks: model.callbacks });
    const stream = await chain.stream(
      { fileName: file.fileName, symbols: names, note: code.truncated ? ` (only the first ${code.shownLines} lines are shown)` : "", code: code.text },
      { signal },
    );
    for await (const piece of stream) {
      if (!piece) continue;
      firstTokenAt ??= Date.now();
      output += piece;
      yield { type: "token", text: piece };
    }
    output = output.trim();
    if (!output) throw new Error("The model returned an empty explanation.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitLlmCall({ ...base, success: false, error: (signal?.aborted ? "cancelled" : message).slice(0, 500), latencyMs: Date.now() - started });
    if (signal?.aborted) throw error;
    const info = PROVIDER_INFO[active.provider];
    throw new Error(info.location === "cloud" ? `${info.label} (${active.model}) failed: ${message}` : "The local model did not respond. Make sure Ollama is running, then try again.");
  }

  const metrics = model.getMetrics();
  emitLlmCall({ ...base, success: true, latencyMs: Date.now() - started, ...metrics });
  const meta: ExplainMeta = {
    provider: active.provider,
    providerLabel: PROVIDER_INFO[active.provider].label,
    location: PROVIDER_INFO[active.provider].location,
    model: active.model,
    totalMs: Date.now() - started,
    firstTokenMs: firstTokenAt ? firstTokenAt - started : undefined,
    tokensPerSecond: metrics.tokensPerSecond,
    promptTokens: metrics.promptTokens,
    completionTokens: metrics.completionTokens,
    truncated: code.truncated,
    shownLines: code.shownLines,
  };
  yield { type: "done", output, meta };
}
