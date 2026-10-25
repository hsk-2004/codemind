/** Types shared by the answer pipeline on the server and the screens that show it. */

/**
 * 'rag' retrieves repository code first; 'direct' asks the model with no code at all;
 * 'auto' answers with RAG on the small local model and suggests a larger model when
 * the answer looks weak; 'escalate' re-asks on that larger model once the user approves.
 */
export type AnswerMode = "rag" | "direct" | "auto" | "escalate";

export interface ModelRef {
  provider: string;
  providerLabel: string;
  location: "local" | "cloud";
  model: string;
}

/** Offered after an 'auto' answer: the larger model the user can approve scaling up to. */
export interface EscalationSuggestion {
  to: ModelRef;
  /** Set when the local answer looks weak, so scaling up is recommended. */
  reason?: string;
}

export interface AnswerMeta extends ModelRef {
  mode: AnswerMode;
  embeddingModel: string;
  promptVersion: string;
  retrievalMs: number;
  generationMs: number;
  totalMs: number;
  /** Time from the question being received to the first word of the answer. */
  firstTokenMs?: number;
  sourcesUsed: number;
  /** 'function': matched function-level chunks; 'file': matched whole-file summaries. */
  retrievalLevel?: "function" | "file";
  retrievalMode?: "vector" | "hybrid";
  grounded: boolean;
  /** How many earlier turns of the conversation were given to the model. */
  historyTurns: number;
  answerChars: number;
  answerWords: number;
  /** Only for 'auto': a larger model the user can scale up to. */
  suggestion?: EscalationSuggestion;
  /** Only for 'auto': why scaling up is not possible, when it is not. */
  keptLocalReason?: string;
  /** Reported by the provider; absent when no generation happened. */
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSecond?: number;
  loadDurationMs?: number;
  promptEvalMs?: number;
  evalMs?: number;
}

export interface FileReference {
  fileName: string;
  sourceCode: string;
  summary: string;
  similarity: number;
}

/** What the server streams while it answers, one JSON object per line. */
export type AskEvent =
  | { type: "sources"; filesReferences: FileReference[]; retrievalMs: number }
  | { type: "token"; text: string }
  | { type: "done"; output: string; filesReferences: FileReference[]; meta: AnswerMeta }
  | { type: "error"; message: string };

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** The reply when nothing in the repository is relevant, instead of letting the model guess. */
export const NO_CONTEXT_ANSWER = "I couldn't find enough relevant information in the indexed repository to answer this confidently.";

/** A function, class or method found in a file. */
export interface FileSymbol {
  name: string;
  kind: "function" | "class" | "method";
  line: number;
}

export interface ExplainMeta extends ModelRef {
  totalMs: number;
  firstTokenMs?: number;
  tokensPerSecond?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** True when the file was too long for the model and only its beginning was explained. */
  truncated: boolean;
  shownLines: number;
}

/** What the server streams while it explains a file. */
export type ExplainEvent =
  | { type: "outline"; fileName: string; language: string | null; lines: number; symbols: FileSymbol[] }
  | { type: "token"; text: string }
  | { type: "done"; output: string; meta: ExplainMeta }
  | { type: "error"; message: string };

/** True when the model replied with the "not enough information" message instead of an answer. */
export const isDeclined = (answer: string) => answer.trim().startsWith(NO_CONTEXT_ANSWER.slice(0, 40));
