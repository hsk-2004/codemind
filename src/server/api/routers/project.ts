import { z } from 'zod';
import { createTRPCRouter, appProcedure } from "../trpc";
import { assertProjectAccess, hasProjectAccess } from '../access';
import { pollCommits } from '@/lib/github';
import { indexGithubRepo, previewFilesToProcess } from '@/lib/github-loader';
import { parseGithubUrl } from '@/lib/github-url';
import { analyzeRepoTree } from '@/lib/repo-insights';
import { fetchRepoTree } from '@/lib/repo-tree';
import { getLangChainEmbeddings } from '@/services/embedding';
import { createPgVectorRetriever } from '@/services/rag/retriever';
import { TRPCError } from '@trpc/server';
import { DbProgressReporter } from '@/server/indexing-job';

const githubUrlSchema = z.string().trim().refine((url) => {
    try {
        parseGithubUrl(url);
        return true;
    } catch {
        return false;
    }
}, { message: 'Must be a GitHub repository URL like https://github.com/owner/repo' });

const projectIdInput = z.object({ projectId: z.string() });

function describeIndexingError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/401|Bad credentials|Unauthorized/i.test(message)) {
        return 'GitHub rejected the token (401). The GITHUB_TOKEN in .env, or the token you entered, is invalid or expired.';
    }
    if (/404|Not Found/i.test(message)) {
        return 'Repository not found. Check the URL, or provide a token if the repository is private.';
    }
    if (/403|rate limit/i.test(message)) {
        return 'GitHub API rate limit reached. Add a GitHub token or try again later.';
    }
    return `Indexing failed: ${message}`;
}

export const projectRouter = createTRPCRouter({
    createProject: appProcedure.input(z.object({
        name: z.string().trim().min(1).max(100),
        githubUrl: githubUrlSchema,
        githubToken: z.string().optional(),
        /** Client-generated id so the UI can poll live progress while this request runs. */
        jobId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    })).mutation(async ({ ctx, input }) => {
        const reporter = await DbProgressReporter.create(ctx.db, input.jobId, {
            userId: ctx.user.userId,
            repoUrl: input.githubUrl,
        });
        const project = await ctx.db.project.create({
            data: {
                githubUrl: input.githubUrl,
                name: input.name,
                UserToProjects: { create: { userId: ctx.user.userId } },
            },
        });
        try {
            const result = await indexGithubRepo(project.id, input.githubUrl, input.githubToken, { reporter });
            if (result.successfulEmbeddings === 0) {
                throw new Error('No files could be indexed. Check that Ollama is running and the repository contains source files.');
            }
            await pollCommits(project.id, reporter);
            await reporter.complete(project.id);
            return project;
        } catch (error) {
            const message = describeIndexingError(error);
            await reporter.fail(message);
            // Never leave a half-created, empty project behind.
            await ctx.db.$transaction([
                ctx.db.sourceCodeEmbedding.deleteMany({ where: { projectId: project.id } }),
                ctx.db.commit.deleteMany({ where: { projectId: project.id } }),
                ctx.db.userToProject.deleteMany({ where: { projectId: project.id } }),
                ctx.db.project.delete({ where: { id: project.id } }),
            ]);
            throw new TRPCError({ code: 'BAD_REQUEST', message });
        }
    }),

    getIndexingJob: appProcedure.input(z.object({ jobId: z.string() })).query(async ({ ctx, input }) => {
        const job = await ctx.db.indexingJob.findUnique({ where: { id: input.jobId } });
        if (!job || job.userId !== ctx.user.userId) return null;
        return job;
    }),

    getLatestIndexingJob: appProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
        if (!(await hasProjectAccess(ctx.db, ctx.user.userId, input.projectId))) return null;
        return ctx.db.indexingJob.findFirst({ where: { projectId: input.projectId }, orderBy: { createdAt: 'desc' } });
    }),

    previewIndex: appProcedure.input(z.object({
        githubUrl: githubUrlSchema,
        githubToken: z.string().optional(),
        maxFiles: z.number().int().min(1).max(100).optional(),
    })).mutation(async ({ input }) => {
        return previewFilesToProcess(input.githubUrl, input.githubToken, input.maxFiles ?? 30);
    }),

    getProjects: appProcedure.query(async ({ ctx }) => {
        return ctx.db.project.findMany({
            where: {
                UserToProjects: { some: { userId: ctx.user.userId } },
                deletedAt: null,
            },
        });
    }),

    getCommits: appProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
        if (!(await hasProjectAccess(ctx.db, ctx.user.userId, input.projectId))) return [];
        return ctx.db.commit.findMany({
            where: { projectId: input.projectId },
            orderBy: { commitDate: "desc" },
        });
    }),

    getBreakingChangesStats: appProcedure.input(z.object({
        projectId: z.string(),
        days: z.number().int().min(1).max(365).optional().default(30),
    })).query(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);

        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - input.days);

        const commits = await ctx.db.commit.findMany({
            where: { projectId: input.projectId, commitDate: { gte: daysAgo } },
            orderBy: { commitDate: "desc" },
        });

        const breakingCommits = commits.filter(commit => commit.hasBreakingChanges);
        const severityCounts = breakingCommits.reduce((acc, commit) => {
            const severity = commit.breakingChangeSeverity || 'unknown';
            acc[severity] = (acc[severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const weeklyData = commits.reduce((acc, commit) => {
            const weekStart = new Date(commit.commitDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const weekKey = weekStart.toISOString().slice(0, 10);
            const week = acc[weekKey] ?? { breaking: 0, total: 0, week: weekStart.toLocaleDateString() };
            week.total += 1;
            if (commit.hasBreakingChanges) week.breaking += 1;
            acc[weekKey] = week;
            return acc;
        }, {} as Record<string, { breaking: number; total: number; week: string }>);

        return {
            totalCommits: commits.length,
            breakingCommits: breakingCommits.length,
            breakingChangePercentage: commits.length > 0 ? (breakingCommits.length / commits.length) * 100 : 0,
            severityCounts,
            weeklyData: Object.values(weeklyData).sort((a, b) => new Date(a.week).getTime() - new Date(b.week).getTime()),
            migrationRequiredCount: breakingCommits.filter(c => c.migrationRequired).length,
            recentBreakingChanges: breakingCommits.slice(0, 10),
        };
    }),

    pollNewCommits: appProcedure.input(projectIdInput).mutation(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
        await pollCommits(input.projectId);
        return { success: true };
    }),

    saveAnswer: appProcedure.input(z.object({
        projectId: z.string(),
        question: z.string().min(1),
        filesReferences: z.any(),
        answer: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
        return ctx.db.question.create({
            data: {
                answer: input.answer,
                filesReferences: input.filesReferences,
                projectId: input.projectId,
                question: input.question,
                userId: ctx.user.userId,
            },
        });
    }),

    getQuestions: appProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
        if (!(await hasProjectAccess(ctx.db, ctx.user.userId, input.projectId))) return [];
        return ctx.db.question.findMany({
            where: { projectId: input.projectId },
            include: { user: true },
            orderBy: { createdAt: 'desc' },
        });
    }),

    archiveProject: appProcedure.input(projectIdInput).mutation(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
        return ctx.db.project.update({ where: { id: input.projectId }, data: { deletedAt: new Date() } });
    }),

    getOverview: appProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
        const projectId = input.projectId;

        const [project, indexedFiles, embeddedRows, commits, breaking, severityGroups, questions, latestCommit] =
            await Promise.all([
                ctx.db.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, githubUrl: true, createdAt: true } }),
                ctx.db.sourceCodeEmbedding.count({ where: { projectId } }),
                ctx.db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "SourceCodeEmbedding" WHERE "projectId" = ${projectId} AND "summaryEmbedding" IS NOT NULL`,
                ctx.db.commit.count({ where: { projectId } }),
                ctx.db.commit.count({ where: { projectId, hasBreakingChanges: true } }),
                ctx.db.commit.groupBy({ by: ['breakingChangeSeverity'], where: { projectId, hasBreakingChanges: true }, _count: true }),
                ctx.db.question.count({ where: { projectId } }),
                ctx.db.commit.findFirst({ where: { projectId }, orderBy: { commitDate: 'desc' }, select: { commitDate: true } }),
            ]);

        return {
            ...project,
            indexedFiles,
            embeddedFiles: Number(embeddedRows[0]?.count ?? 0),
            commits,
            breakingChanges: breaking,
            breakingBySeverity: Object.fromEntries(
                severityGroups.map((g) => [g.breakingChangeSeverity ?? 'unknown', g._count]),
            ) as Record<string, number>,
            savedQuestions: questions,
            latestCommitAt: latestCommit?.commitDate ?? null,
        };
    }),

    getInsights: appProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
        const project = await ctx.db.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { githubUrl: true } });
        try {
            const tree = await fetchRepoTree(project.githubUrl);
            return { ...analyzeRepoTree(tree.paths), defaultBranch: tree.defaultBranch, truncated: tree.truncated };
        } catch (error) {
            throw new TRPCError({
                code: 'BAD_GATEWAY',
                message: `Could not read the repository from GitHub: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }),

    search: appProcedure.input(z.object({
        projectId: z.string(),
        query: z.string().trim().min(2).max(500),
        limit: z.number().int().min(1).max(20).default(8),
    })).mutation(async ({ ctx, input }) => {
        await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
        const started = Date.now();
        const retrieve = createPgVectorRetriever(ctx.db, getLangChainEmbeddings(input.projectId), input.projectId, {
            k: input.limit,
            minScore: 0.2,
        });
        let docs;
        try {
            docs = await retrieve(input.query);
        } catch (error) {
            throw new TRPCError({
                code: 'SERVICE_UNAVAILABLE',
                message: 'Embedding model unavailable. Make sure Ollama is running with nomic-embed-text.',
                cause: error,
            });
        }
        return {
            latencyMs: Date.now() - started,
            results: docs.map((doc) => ({
                fileName: doc.metadata.source,
                summary: doc.metadata.summary,
                score: doc.metadata.score,
                preview: doc.pageContent.slice(0, 2000),
                lines: doc.pageContent.split('\n').length,
            })),
        };
    }),

    getFiles: appProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
        if (!(await hasProjectAccess(ctx.db, ctx.user.userId, input.projectId))) return [];
        const rows = await ctx.db.$queryRaw<{ id: string; fileName: string; summary: string; embedded: boolean; lines: number; chars: number }[]>`
            SELECT "id", "fileName", "summary", "summaryEmbedding" IS NOT NULL AS embedded,
                   array_length(string_to_array("sourceCode", E'\n'), 1) AS lines,
                   length("sourceCode") AS chars
            FROM "SourceCodeEmbedding"
            WHERE "projectId" = ${input.projectId}
            ORDER BY "fileName"
        `;
        return rows.map((r) => ({ ...r, lines: Number(r.lines ?? 0), chars: Number(r.chars ?? 0) }));
    }),

    getFile: appProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const file = await ctx.db.sourceCodeEmbedding.findUnique({
            where: { id: input.id },
            select: { id: true, fileName: true, summary: true, sourceCode: true, projectId: true },
        });
        if (!file) throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
        await assertProjectAccess(ctx.db, ctx.user.userId, file.projectId);
        return file;
    }),
});
