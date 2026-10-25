import { stopResult, type AskResult } from "./ask-client";
import { NO_CONTEXT_ANSWER, type AnswerMode } from "./ask-types";
import type { ChatTurn } from "@/services/rag/history";

export type AskMode = Exclude<AnswerMode, "escalate"> | "compare";

/** One question and its answer or answers (two when the question was asked with and without RAG). */
export interface Turn {
  id: string;
  question: string;
  mode: AskMode;
  results: AskResult[];
}

export const MAX_STORED_TURNS = 20;
const MAX_STORED_SOURCES = 8;
const MAX_STORED_CODE_CHARS = 1500;
/** localStorage holds about 5 MB; stay well below it. */
const MAX_STORED_CHARS = 400_000;

export const storageKey = (projectId: string) => `codemind-chat:${projectId}`;

/** A short unique id that also works on plain HTTP, where crypto.randomUUID is unavailable. */
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** The earlier questions and answers to send along with a follow-up. */
export function historyFor(turns: Turn[]): ChatTurn[] {
  const history: ChatTurn[] = [];
  for (const turn of turns) {
    // Prefer the grounded answer: the scaled-up one, then RAG, then whatever finished.
    const best =
      turn.results.find((r) => r.mode === "escalate" && r.status === "done") ??
      turn.results.find((r) => (r.mode === "rag" || r.mode === "auto") && r.status === "done") ??
      turn.results.find((r) => r.status === "done");
    if (best && best.output.trim() && best.output !== NO_CONTEXT_ANSWER) history.push({ question: turn.question, answer: best.output });
  }
  return history;
}

/** Shrinks a conversation so it fits in browser storage: long code excerpts and old turns are dropped. */
export function serializeTurns(turns: Turn[]): string {
  const slim = turns.slice(-MAX_STORED_TURNS).map((turn) => ({
    ...turn,
    results: turn.results.map((result) => ({
      ...stopResult(result),
      filesReferences: result.filesReferences
        .slice(0, MAX_STORED_SOURCES)
        .map((file) => ({ ...file, sourceCode: file.sourceCode.slice(0, MAX_STORED_CODE_CHARS) })),
    })),
  }));
  let kept = slim;
  let text = JSON.stringify(kept);
  while (text.length > MAX_STORED_CHARS && kept.length > 1) {
    kept = kept.slice(1);
    text = JSON.stringify(kept);
  }
  return text;
}

const isResult = (value: unknown): value is AskResult =>
  typeof value === "object" && value !== null && typeof (value as AskResult).status === "string" && typeof (value as AskResult).output === "string";

/** Reads a stored conversation. Anything damaged or half-finished is cleaned up, never trusted. */
export function restoreTurns(raw: string | null): Turn[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((turn): turn is Turn => typeof turn === "object" && turn !== null && typeof turn.id === "string" && typeof turn.question === "string" && Array.isArray(turn.results))
      .map((turn) => ({ ...turn, results: turn.results.filter(isResult).map(stopResult) }))
      .filter((turn) => turn.results.length > 0);
  } catch {
    return [];
  }
}
