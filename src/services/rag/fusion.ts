/** Words too common in questions to help a keyword search. */
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "how", "what", "where", "which", "who", "why", "does", "this", "that", "with", "from",
  "into", "about", "work", "works", "use", "used", "uses", "code", "file", "files", "function", "functions", "can",
  "you", "tell", "show", "explain", "there", "their", "when", "have", "has", "was", "were", "your", "our", "its",
]);

/**
 * Picks the words of a question worth matching literally: identifiers such as
 * `getCommitHashes` or `chunk_size`, not filler like "how does". Returned
 * terms are safe to place inside a tsquery (letters, digits and underscores only).
 */
export function keywordTerms(question: string, max = 8): string[] {
  const seen = new Set<string>();
  for (const word of question.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []) {
    const term = word.toLowerCase();
    if (!STOP_WORDS.has(term)) seen.add(term);
  }
  return [...seen].slice(0, max);
}

/** Builds a Postgres `to_tsquery` string that matches any of the terms. */
export function toTsQuery(terms: string[]): string {
  return terms.join(" | ");
}

/**
 * Reciprocal Rank Fusion: merges several ranked lists into one by summing
 * 1 / (k + rank) for every list an item appears in. It needs no score
 * normalisation, so vector similarity and keyword rank can be combined directly.
 * Items found by more than one list rise to the top.
 */
export function reciprocalRankFusion<T>(lists: T[][], keyOf: (item: T) => string, k = 60): { item: T; score: number }[] {
  const merged = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const key = keyOf(item);
      const entry = merged.get(key) ?? { item, score: 0 };
      entry.score += 1 / (k + index + 1);
      merged.set(key, entry);
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}
