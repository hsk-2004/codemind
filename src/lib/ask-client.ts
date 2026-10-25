import type { AnswerMeta, AnswerMode, AskEvent, FileReference } from "./ask-types";
import { createTokenCoalescer, streamEvents } from "./stream-client";
import type { ChatTurn } from "@/services/rag/history";

/** One answer on screen, from the moment it is requested until it is finished. */
export interface AskResult {
  mode: AnswerMode;
  /** loading: waiting for the first word. streaming: words are arriving. */
  status: "loading" | "streaming" | "done" | "error" | "stopped";
  output: string;
  filesReferences: FileReference[];
  /** Set once retrieval has finished, even while the answer is still being written. */
  retrievalMs?: number;
  meta: AnswerMeta | null;
  startedAt: number;
}

export const pendingResult = (mode: AnswerMode): AskResult => ({
  mode,
  status: "loading",
  output: "",
  filesReferences: [],
  meta: null,
  startedAt: Date.now(),
});

/** Folds one streamed event into the answer shown on screen. */
export function applyEvent(result: AskResult, event: AskEvent): AskResult {
  switch (event.type) {
    case "sources":
      return { ...result, filesReferences: event.filesReferences, retrievalMs: event.retrievalMs };
    case "token":
      return { ...result, status: "streaming", output: result.output + event.text };
    case "done":
      return { ...result, status: "done", output: event.output, filesReferences: event.filesReferences, meta: event.meta };
    case "error":
      return { ...result, status: "error", output: event.message };
  }
}

/** A finished answer is kept as it is; one that was cut short by Stop keeps the words written so far. */
export const stopResult = (result: AskResult): AskResult =>
  result.status === "loading" || result.status === "streaming" ? { ...result, status: "stopped" } : result;

export interface AskRequest {
  question: string;
  projectId: string;
  mode: AnswerMode;
  history?: ChatTurn[];
  model?: { provider: string; model: string };
}

/** Asks a question and reports each event as it arrives (see streamEvents). */
export const streamAsk = (request: AskRequest, onEvent: (event: AskEvent) => void, signal?: AbortSignal) => streamEvents<AskEvent>("/api/ask", request, onEvent, signal);

export { createTokenCoalescer };
