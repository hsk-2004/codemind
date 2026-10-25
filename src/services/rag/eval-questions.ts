import type { EvalQuestion } from "./eval-metrics";
import { listSymbols } from "./chunking";

export interface IndexedFile {
  fileName: string;
  sourceCode: string;
  summary: string;
}

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|py|go|rs|java)$/i;
const GENERIC_NAMES = new Set(["default", "main", "index", "handler", "render", "constructor", "init", "setup", "run", "get", "set"]);

/** A summary without the "path: " prefix some summaries start with, cut to one sentence. */
function conceptOf(summary: string): string | null {
  const text = summary.replace(/^[^\s:]+\/[^\s:]*:\s*/, "").replace(/\s+/g, " ").trim();
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  // A summary that is really a line of code makes a bad question.
  if (/[{}<>=;`$]|=>|\(\)/.test(sentence)) return null;
  return sentence.length >= 30 ? sentence.slice(0, 160).replace(/[.!?]$/, "") : null;
}

/**
 * Builds a starter question set from the repository itself, so the lab can be
 * tried on any project: some questions name a function, some describe what a
 * file is for. They are easier than real questions, which makes them a quick
 * sanity check, not a benchmark. Each file is used at most once.
 */
export function suggestQuestions(files: IndexedFile[], count: number, random: () => number = Math.random): EvalQuestion[] {
  const shuffled = [...files].sort(() => random() - 0.5);
  const questions: EvalQuestion[] = [];
  const used = new Set<string>();
  const wantSymbolQuestions = Math.ceil(count / 2);

  for (const file of shuffled) {
    if (questions.length >= wantSymbolQuestions) break;
    if (!CODE_FILE.test(file.fileName)) continue;
    const symbol = listSymbols(file.sourceCode, 30).find((s) => s.name.length >= 6 && !GENERIC_NAMES.has(s.name.toLowerCase()));
    if (!symbol) continue;
    questions.push({ question: `Where is ${symbol.kind === "class" ? "the class" : "the function"} ${symbol.name} defined?`, expectedFiles: [file.fileName] });
    used.add(file.fileName);
  }
  for (const file of shuffled) {
    if (questions.length >= count) break;
    if (used.has(file.fileName)) continue;
    const concept = conceptOf(file.summary);
    if (!concept) continue;
    questions.push({ question: `Which file is responsible for this: ${concept}?`, expectedFiles: [file.fileName] });
    used.add(file.fileName);
  }
  return questions;
}
