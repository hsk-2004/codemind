/** One evaluation question: the files a correct retrieval should surface. */
export interface EvalQuestion {
  question: string;
  expectedFiles: string[];
}

export interface QuestionResult {
  question: string;
  /** Retrieved file names in rank order. */
  retrieved: string[];
  expectedFiles: string[];
}

const matches = (retrieved: string, expected: string) => retrieved === expected || retrieved.endsWith(`/${expected}`);

/** 1-based rank of the first retrieved file that is expected, or 0 when none is. */
export function firstHitRank(result: QuestionResult): number {
  const index = result.retrieved.findIndex((file) => result.expectedFiles.some((expected) => matches(file, expected)));
  return index === -1 ? 0 : index + 1;
}

export interface RetrievalMetrics {
  questions: number;
  /** Share of questions with an expected file in the top k. */
  hitRate: number;
  /** Mean reciprocal rank: 1 for a first-place hit, 0.5 for second, 0 for a miss. */
  mrr: number;
  /** Average share of the top k that is an expected file. */
  precision: number;
}

export function summarizeRetrieval(results: QuestionResult[], k: number): RetrievalMetrics {
  if (results.length === 0) return { questions: 0, hitRate: 0, mrr: 0, precision: 0 };
  let hits = 0;
  let reciprocal = 0;
  let precision = 0;
  for (const result of results) {
    const top = result.retrieved.slice(0, k);
    const rank = firstHitRank({ ...result, retrieved: top });
    if (rank > 0) hits++;
    reciprocal += rank > 0 ? 1 / rank : 0;
    const relevant = top.filter((file) => result.expectedFiles.some((expected) => matches(file, expected))).length;
    precision += top.length === 0 ? 0 : relevant / top.length;
  }
  return {
    questions: results.length,
    hitRate: hits / results.length,
    mrr: reciprocal / results.length,
    precision: precision / results.length,
  };
}
