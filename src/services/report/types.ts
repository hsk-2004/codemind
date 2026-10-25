export interface ReportOptions {
  /** Which optional sections to include. The title block and the overview are always there. */
  languages: boolean;
  breaking: boolean;
  answers: boolean;
  aiUsage: boolean;
}

export const ALL_SECTIONS: ReportOptions = { languages: true, breaking: true, answers: true, aiUsage: true };

export interface ReportData {
  generatedAt: Date;
  project: { name: string; githubUrl: string; createdAt: Date };
  overview: {
    indexedFiles: number;
    embeddedFiles: number;
    functionChunks: number;
    commits: number;
    breakingCommits: number;
    savedAnswers: number;
    latestCommitAt: Date | null;
  };
  languages: { language: string; files: number; percent: number }[];
  tooling: { label: string; value: string }[];
  suggestions: string[];
  breaking: { date: Date; severity: string; message: string; author: string; details: string }[];
  breakingBySeverity: Record<string, number>;
  answers: { question: string; answer: string; askedAt: Date; sources: string[] }[];
  aiUsage: {
    calls: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
    avgLatencyMs: number | null;
    avgTokensPerSecond: number | null;
    models: { model: string; provider: string; calls: number; avgTokensPerSecond: number | null; avgLatencyMs: number | null }[];
  };
}
