import type { AnswerMeta } from "./ask-types";

/** Model size for display: the file size for a local model, a parameter count for a cloud one when its name says so. */
export function modelSizeLabel(model: { provider: string; model: string; sizeBytes?: number }): string {
  if (model.sizeBytes) {
    const gb = model.sizeBytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB on disk` : `${Math.round(model.sizeBytes / 1e6)} MB on disk`;
  }
  // Cloud providers do not publish sizes, but many names carry one: gpt-oss-20b, qwen3.8-27b, gemma-4-31b-it.
  const params = /(?:^|[-_/:])(\d+(?:\.\d+)?)b(?:$|[-_:])/i.exec(model.model)?.[1];
  return params ? `≈${params}B parameters` : model.provider === "ollama" ? "Size unknown" : "Cloud-hosted, size not published";
}

export interface Contender {
  key: string;
  meta: AnswerMeta;
}

export interface Winners {
  firstWord?: string;
  total?: string;
  speed?: string;
  longest?: string;
}

const best = (rows: Contender[], value: (meta: AnswerMeta) => number | undefined, better: "lower" | "higher"): string | undefined => {
  const scored = rows.map((row) => ({ key: row.key, value: value(row.meta) })).filter((row): row is { key: string; value: number } => typeof row.value === "number" && row.value > 0);
  // A "winner" among one contender, or a tie, says nothing.
  if (scored.length < 2) return undefined;
  const sorted = [...scored].sort((a, b) => (better === "lower" ? a.value - b.value : b.value - a.value));
  return sorted[0]!.value === sorted[1]!.value ? undefined : sorted[0]!.key;
};

/** Which model started answering first, finished first, wrote fastest and wrote the most. */
export function pickWinners(rows: Contender[]): Winners {
  return {
    firstWord: best(rows, (m) => m.firstTokenMs, "lower"),
    total: best(rows, (m) => m.totalMs, "lower"),
    speed: best(rows, (m) => m.tokensPerSecond, "higher"),
    longest: best(rows, (m) => m.answerWords, "higher"),
  };
}

export const MAX_COMPARED_MODELS = 4;
export const modelKey = (provider: string, model: string) => `${provider}::${model}`;
export function parseModelKey(key: string): { provider: "ollama" | "gemini" | "groq"; model: string } {
  const index = key.indexOf("::");
  return { provider: key.slice(0, index) as "ollama" | "gemini" | "groq", model: key.slice(index + 2) };
}
