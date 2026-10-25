import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { PrismaClient } from "@prisma/client";
import { firstHitRank, summarizeRetrieval, type EvalQuestion, type QuestionResult, type RetrievalMetrics } from "./eval-metrics";
import { createProjectRetriever, type RetrievalMode } from "./retriever";

export interface QuestionOutcome extends QuestionResult {
  /** 1-based rank of the first expected file, or 0 when it was not retrieved. */
  hitRank: number;
}

export interface StrategyResult {
  mode: RetrievalMode;
  metrics: RetrievalMetrics;
  /** Average time to retrieve for one question. */
  avgMs: number;
  questions: QuestionOutcome[];
}

export interface EvalReport {
  k: number;
  /** 'file' means the project has no function-level index, so hybrid search has nothing extra to search. */
  level: "function" | "file";
  strategies: StrategyResult[];
  ranAt: string;
}

/**
 * Runs every question through vector-only and hybrid retrieval and scores both.
 * The command-line script and the Retrieval lab page both use this, so their numbers agree.
 */
export async function runRetrievalEval(db: PrismaClient, embeddings: EmbeddingsInterface, projectId: string, questions: EvalQuestion[], k: number): Promise<EvalReport> {
  const strategies: StrategyResult[] = [];
  let level: EvalReport["level"] = "function";
  for (const mode of ["vector", "hybrid"] as const) {
    const { retrieve, level: indexLevel } = await createProjectRetriever(db, embeddings, projectId, k, mode);
    level = indexLevel;
    const started = Date.now();
    const outcomes: QuestionOutcome[] = [];
    for (const { question, expectedFiles } of questions) {
      const sources = await retrieve(question);
      const result: QuestionResult = { question, expectedFiles, retrieved: sources.map((doc) => doc.metadata.source) };
      outcomes.push({ ...result, hitRank: firstHitRank({ ...result, retrieved: result.retrieved.slice(0, k) }) });
    }
    strategies.push({
      mode,
      metrics: summarizeRetrieval(outcomes, k),
      avgMs: questions.length > 0 ? (Date.now() - started) / questions.length : 0,
      questions: outcomes,
    });
  }
  return { k, level, strategies, ranAt: new Date().toISOString() };
}
