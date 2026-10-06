import type { Prisma, PrismaClient } from "@prisma/client";
import type { EventLevel, IndexCounters, IndexEvent, IndexStage, ProgressReporter } from "@/lib/indexing-progress";

const MAX_EVENTS = 300;
const FLUSH_INTERVAL_MS = 400;

/**
 * Progress reporter that keeps job state in memory and flushes it to the
 * IndexingJob row at most every 400ms, serialised so parallel file workers
 * never race each other's writes.
 */
export class DbProgressReporter implements ProgressReporter {
  private counters: IndexCounters = {
    filesInRepo: 0, filesSelected: 0, filesProcessed: 0, filesEmbedded: 0,
    filesFailed: 0, commitsFound: 0, commitsAnalyzed: 0, breakingFound: 0,
  };
  private currentStage: IndexStage = "queued";
  private stageStartedAt = Date.now();
  private stageTimings: Record<string, number> = {};
  private events: IndexEvent[] = [];
  private currentItem: string | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: PrismaClient, readonly jobId: string) {}

  static async create(db: PrismaClient, jobId: string, data: { userId: string; repoUrl: string; projectId?: string }) {
    await db.indexingJob.create({ data: { id: jobId, ...data, status: "running", stage: "queued" } });
    return new DbProgressReporter(db, jobId);
  }

  stage(stage: IndexStage, message: string): void {
    this.closeStage();
    this.currentStage = stage;
    this.stageStartedAt = Date.now();
    this.log(message);
  }

  increment(counter: keyof IndexCounters, by = 1): void {
    this.counters[counter] += by;
    this.schedule();
  }

  set(patch: Partial<IndexCounters> & { currentItem?: string | null }): void {
    const { currentItem, ...counters } = patch;
    Object.assign(this.counters, counters);
    if (currentItem !== undefined) this.currentItem = currentItem;
    this.schedule();
  }

  log(message: string, level: EventLevel = "info"): void {
    this.events.push({ at: new Date().toISOString(), level, message });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.schedule();
  }

  async complete(projectId: string): Promise<void> {
    this.closeStage();
    this.currentStage = "done";
    this.currentItem = null;
    this.log("Indexing complete", "success");
    await this.flush({ status: "completed", projectId, finishedAt: new Date() });
  }

  async fail(error: string): Promise<void> {
    this.closeStage();
    this.currentItem = null;
    this.log(error, "error");
    await this.flush({ status: "failed", error, finishedAt: new Date() });
  }

  private closeStage() {
    if (this.currentStage !== "queued" && this.currentStage !== "done") {
      this.stageTimings[this.currentStage] = (this.stageTimings[this.currentStage] ?? 0) + (Date.now() - this.stageStartedAt);
    }
  }

  private schedule() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private flush(extra: Prisma.IndexingJobUpdateInput = {}): Promise<unknown> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const snapshot: Prisma.IndexingJobUpdateInput = {
      ...this.counters,
      stage: this.currentStage,
      currentItem: this.currentItem,
      stageTimings: { ...this.stageTimings },
      events: this.events as unknown as Prisma.InputJsonValue,
      ...extra,
    };
    this.dirty = false;
    this.chain = this.chain
      .then(() => this.db.indexingJob.update({ where: { id: this.jobId }, data: snapshot }))
      .catch((error: unknown) => console.error("Failed to update indexing job:", error));
    return this.chain;
  }
}
