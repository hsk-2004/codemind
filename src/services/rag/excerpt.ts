const STOPWORDS = new Set([
  "the", "and", "for", "are", "this", "that", "with", "from", "how", "what", "where", "which", "when", "why", "who",
  "does", "did", "can", "will", "has", "have", "its", "into", "about", "name", "file", "files", "function", "code",
  "app", "project", "use", "used", "using", "list", "show", "tell", "explain", "get", "all", "any", "not",
]);

/** Significant words of a question, lower-cased, without filler words. */
export function keywords(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOPWORDS.has(w)))];
}

/**
 * Picks the part of a file most relevant to the question.
 *
 * Retrieval works per file, but a small model can only read a couple of
 * thousand characters of each one. Always sending the top of the file misses
 * the answer whenever the relevant code is further down, so this slides a
 * window over the file and keeps the one mentioning the question's words most.
 */
export function bestExcerpt(code: string, question: string, maxChars: number): { text: string; startLine: number; truncated: boolean } {
  if (code.length <= maxChars) return { text: code, startLine: 1, truncated: false };

  const terms = keywords(question);
  const lines = code.split("\n");
  const scores = lines.map((line) => {
    const lower = line.toLowerCase();
    return terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
  });

  // Candidate windows begin a few lines before each matching line, so the match
  // itself sits near the top of the window with a little lead-in context.
  const LEAD_IN_LINES = 3;
  let start = 0; // no match anywhere: show the top of the file (imports, declarations)
  let bestScore = 0;
  for (let match = 0; match < lines.length; match++) {
    if (scores[match] === 0) continue;
    const candidate = Math.max(0, match - LEAD_IN_LINES);
    let chars = 0;
    let score = 0;
    for (let i = candidate; i < lines.length; i++) {
      chars += lines[i]!.length + 1;
      if (chars > maxChars) break;
      score += scores[i]!;
    }
    // Strictly greater, so on a tie the earliest window wins.
    if (score > bestScore) {
      bestScore = score;
      start = candidate;
    }
  }

  const picked: string[] = [];
  let used = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (used + line.length + 1 > maxChars) {
      // A single line longer than the whole budget (e.g. minified code).
      if (picked.length === 0) picked.push(line.slice(0, maxChars));
      break;
    }
    picked.push(line);
    used += line.length + 1;
  }

  return { text: picked.join("\n"), startLine: start + 1, truncated: true };
}
