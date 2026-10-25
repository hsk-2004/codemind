import type { PrismaClient } from "@prisma/client";
import { analyzeRepoTree } from "@/lib/repo-insights";
import { buildMetricsSummary } from "@/server/metrics-summary";
import type { ReportData } from "@/services/report/types";

const MAX_BREAKING = 15;
const MAX_ANSWERS = 8;

const sourcesOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((f: { fileName?: string; filename?: string }) => f.fileName ?? f.filename ?? "").filter(Boolean) : [];

/** Collects everything the report shows. Reads only this project's rows and makes no network calls. */
export async function gatherReportData(db: PrismaClient, projectId: string): Promise<ReportData> {
  const [project, files, embedded, chunks, commits, breakingCommits, severities, questionCount, latest, breaking, questions, calls] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, githubUrl: true, createdAt: true } }),
    db.sourceCodeEmbedding.findMany({ where: { projectId }, select: { fileName: true } }),
    db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "SourceCodeEmbedding" WHERE "projectId" = ${projectId} AND "summaryEmbedding" IS NOT NULL`,
    db.codeChunk.count({ where: { projectId } }),
    db.commit.count({ where: { projectId } }),
    db.commit.count({ where: { projectId, hasBreakingChanges: true } }),
    db.commit.groupBy({ by: ["breakingChangeSeverity"], where: { projectId, hasBreakingChanges: true }, _count: true }),
    db.question.count({ where: { projectId } }),
    db.commit.findFirst({ where: { projectId }, orderBy: { commitDate: "desc" }, select: { commitDate: true } }),
    db.commit.findMany({ where: { projectId, hasBreakingChanges: true }, orderBy: { commitDate: "desc" }, take: MAX_BREAKING }),
    db.question.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: MAX_ANSWERS }),
    db.llmCall.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: 10_000,
      select: { createdAt: true, operation: true, provider: true, model: true, success: true, latencyMs: true, promptTokens: true, completionTokens: true, tokensPerSecond: true, loadDurationMs: true },
    }),
  ]);

  // The indexed file names are enough to detect languages, CI, Docker and tests, with no GitHub request.
  const insights = analyzeRepoTree(files.map((f) => f.fileName));
  const tooling = [
    ...(insights.docker.dockerfiles.length > 0 ? [{ label: "Docker", value: [...insights.docker.dockerfiles, ...insights.docker.compose].join(", ") }] : []),
    ...insights.ci.map((c) => ({ label: c.name, value: c.files.join(", ") })),
    ...insights.dependencies.map((d) => ({ label: d.name, value: d.files.join(", ") })),
    ...insights.tests.frameworks.map((t) => ({ label: `${t.name} tests`, value: `${insights.tests.testFiles} test files` })),
  ];

  const usage = buildMetricsSummary(calls, 24 * 90);
  return {
    generatedAt: new Date(),
    project,
    overview: {
      indexedFiles: files.length,
      embeddedFiles: Number(embedded[0]?.count ?? 0),
      functionChunks: chunks,
      commits,
      breakingCommits,
      savedAnswers: questionCount,
      latestCommitAt: latest?.commitDate ?? null,
    },
    languages: insights.languages,
    tooling,
    suggestions: insights.suggestions,
    breaking: breaking.map((c) => ({ date: c.commitDate, severity: c.breakingChangeSeverity ?? "unknown", message: c.commitMessage, author: c.commitAuthorName, details: c.breakingChangeDetails ?? "" })),
    breakingBySeverity: Object.fromEntries(severities.map((g) => [g.breakingChangeSeverity ?? "unknown", g._count])),
    answers: questions.map((q) => ({ question: q.question, answer: q.answer, askedAt: q.createdAt, sources: sourcesOf(q.filesReferences) })),
    aiUsage: {
      calls: usage.totals.calls,
      errors: usage.totals.errors,
      promptTokens: usage.totals.promptTokens,
      completionTokens: usage.totals.completionTokens,
      avgLatencyMs: usage.totals.avgLatencyMs,
      avgTokensPerSecond: usage.totals.avgTokensPerSecond,
      models: usage.byModel.map((m) => ({ model: m.model, provider: m.provider, calls: m.calls, avgTokensPerSecond: m.avgTokensPerSecond, avgLatencyMs: m.avgLatencyMs })),
    },
  };
}
