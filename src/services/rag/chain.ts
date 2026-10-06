import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { Document } from "@langchain/core/documents";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, type RunnableLike } from "@langchain/core/runnables";
import type { ProviderId } from "@/services/llm/provider";
import { bestExcerpt } from "./excerpt";
import { directPrompt, ragPrompt } from "./prompt";

export const NO_CONTEXT_ANSWER =
  "I couldn't find enough relevant information in the indexed repository to answer this confidently.";

export interface SourceMetadata {
  source: string;
  summary: string;
  score: number;
}

export type SourceDocument = Document<SourceMetadata>;

export type Retrieve = (question: string) => Promise<SourceDocument[]>;

export interface ContextLimits {
  maxCharsPerDoc: number;
  maxTotalChars: number;
}

// Local models run with a ~3k token window (LLM_NUM_CTX), so whole files cannot
// be pasted in; each source is cut to an excerpt and the total context is capped.
export const DEFAULT_CONTEXT_LIMITS: ContextLimits = { maxCharsPerDoc: 1800, maxTotalChars: 7500 };

// Cloud models have far larger context windows, so they can read most files whole.
export const CLOUD_CONTEXT_LIMITS: ContextLimits = { maxCharsPerDoc: 12_000, maxTotalChars: 48_000 };

// Groq's free tier caps a request at 8,000 tokens (prompt plus reserved output).
export const GROQ_CONTEXT_LIMITS: ContextLimits = { maxCharsPerDoc: 6000, maxTotalChars: 14_000 };

export function contextLimitsFor(provider: ProviderId): ContextLimits {
  if (provider === "ollama") return DEFAULT_CONTEXT_LIMITS;
  return provider === "groq" ? GROQ_CONTEXT_LIMITS : CLOUD_CONTEXT_LIMITS;
}

// Below this an excerpt is too small to be useful, so fewer sources are shown instead.
const MIN_CHARS_PER_DOC = 800;
const SUMMARY_MAX_CHARS = 200;

/**
 * Splits the total budget between the sources. Files smaller than their share
 * hand the unused part to the larger ones, so no retrieved file is left out
 * just because the files ranked above it were long.
 */
function codeBudgets(docs: SourceDocument[], limits: ContextLimits): number[] {
  const budgets = new Array<number>(docs.length).fill(0);
  let remaining = limits.maxTotalChars;
  const smallestFirst = docs.map((doc, index) => ({ index, length: doc.pageContent.length })).sort((a, b) => a.length - b.length);

  smallestFirst.forEach(({ index, length }, position) => {
    const share = Math.floor(remaining / (docs.length - position));
    const budget = Math.max(0, Math.min(length, limits.maxCharsPerDoc, share));
    budgets[index] = budget;
    remaining -= budget;
  });
  return budgets;
}

export function formatContext(
  docs: SourceDocument[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
  question = "",
): string {
  // Sources arrive best match first; always keep the top one.
  const shown = docs.slice(0, Math.max(1, Math.floor(limits.maxTotalChars / MIN_CHARS_PER_DOC)));
  const budgets = codeBudgets(shown, limits);

  return shown
    .map((doc, i) => {
      // When a file does not fit, show the part most relevant to the question, not just its top.
      const excerpt = bestExcerpt(doc.pageContent, question, budgets[i]!);
      const location = excerpt.truncated ? ` (excerpt starting at line ${excerpt.startLine})` : "";
      const code = excerpt.truncated ? `${excerpt.text}\n... (truncated)` : excerpt.text;
      const summary = doc.metadata.summary.slice(0, SUMMARY_MAX_CHARS);
      return `File: ${doc.metadata.source}${location}\nSummary: ${summary}\nCode:\n${code}`;
    })
    .join("\n\n---\n\n");
}

export interface RagAnswer {
  answer: string;
  sources: SourceDocument[];
}

export function createRagChain({
  llm,
  retrieve,
  callbacks,
  limits = DEFAULT_CONTEXT_LIMITS,
}: {
  llm: RunnableLike;
  retrieve: Retrieve;
  callbacks?: Callbacks;
  limits?: ContextLimits;
}) {
  const generate = RunnableSequence.from([ragPrompt, llm, new StringOutputParser()]).withConfig({ callbacks });

  return async function answerQuestion(question: string): Promise<RagAnswer> {
    const sources = await retrieve(question);

    // No evidence -> say so honestly instead of letting the model guess.
    if (sources.length === 0) {
      return { answer: NO_CONTEXT_ANSWER, sources: [] };
    }

    const answer = await generate.invoke({ context: formatContext(sources, limits, question), question });
    return { answer: answer.trim(), sources };
  };
}

/**
 * The same model without retrieval: no repository code is put in the prompt.
 * Used to compare answers with and without RAG.
 */
export function createDirectChain({ llm, callbacks }: { llm: RunnableLike; callbacks?: Callbacks }) {
  const generate = RunnableSequence.from([directPrompt, llm, new StringOutputParser()]).withConfig({ callbacks });

  return async function answerWithoutContext(question: string, repository: string): Promise<string> {
    const answer = await generate.invoke({ repository, question });
    return answer.trim();
  };
}
