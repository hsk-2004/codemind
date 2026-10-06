export type IndexStage = "queued" | "loading" | "selecting" | "indexing" | "chunking" | "commits" | "done";

export interface IndexCounters {
  filesInRepo: number;
  filesSelected: number;
  filesProcessed: number;
  filesEmbedded: number;
  filesFailed: number;
  commitsFound: number;
  commitsAnalyzed: number;
  breakingFound: number;
}

export type EventLevel = "info" | "success" | "warn" | "error";

export interface IndexEvent {
  at: string;
  level: EventLevel;
  message: string;
}

/** Receives progress from the indexing pipeline. Implementations must not throw. */
export interface ProgressReporter {
  stage(stage: IndexStage, message: string): void;
  increment(counter: keyof IndexCounters, by?: number): void;
  set(patch: Partial<IndexCounters> & { currentItem?: string | null }): void;
  log(message: string, level?: EventLevel): void;
}

export const noopReporter: ProgressReporter = {
  stage: () => {},
  increment: () => {},
  set: () => {},
  log: () => {},
};

export const formatDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
