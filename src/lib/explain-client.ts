import type { ExplainEvent, ExplainMeta, FileSymbol } from "./ask-types";

export interface ExplainState {
  status: "loading" | "streaming" | "done" | "error" | "stopped";
  outline: { fileName: string; language: string | null; lines: number; symbols: FileSymbol[] } | null;
  output: string;
  meta: ExplainMeta | null;
  startedAt: number;
}

export const pendingExplain = (): ExplainState => ({ status: "loading", outline: null, output: "", meta: null, startedAt: Date.now() });

/** Folds one streamed event into what the sheet shows. */
export function applyExplainEvent(state: ExplainState, event: ExplainEvent): ExplainState {
  switch (event.type) {
    case "outline":
      return { ...state, outline: { fileName: event.fileName, language: event.language, lines: event.lines, symbols: event.symbols } };
    case "token":
      return { ...state, status: "streaming", output: state.output + event.text };
    case "done":
      return { ...state, status: "done", output: event.output, meta: event.meta };
    case "error":
      return { ...state, status: "error", output: event.message };
  }
}

/** Functions are shown first; more than this many are folded behind "show all". */
export const VISIBLE_SYMBOLS = 12;
