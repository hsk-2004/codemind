import { z } from "zod";
import { buildMetricsSummary } from "@/server/metrics-summary";
import { createTRPCRouter, appProcedure } from "../trpc";

export const metricsRouter = createTRPCRouter({
  overview: appProcedure
    .input(z.object({
      projectId: z.string().optional(),
      rangeHours: z.number().int().min(1).max(24 * 90).default(24 * 7),
    }))
    .query(async ({ ctx, input }) => {
      // Only ever report on projects the user is a member of.
      const memberships = await ctx.db.userToProject.findMany({
        where: { userId: ctx.user.userId },
        select: { projectId: true },
      });
      const allowed = memberships.map((m) => m.projectId);
      const projectIds = input.projectId ? allowed.filter((id) => id === input.projectId) : allowed;

      const since = new Date(Date.now() - input.rangeHours * 3_600_000);
      const where = { projectId: { in: projectIds }, createdAt: { gte: since } };

      const [rows, recent] = await Promise.all([
        ctx.db.llmCall.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: 10_000,
          select: {
            createdAt: true, operation: true, provider: true, model: true, success: true, latencyMs: true, promptTokens: true,
            completionTokens: true, tokensPerSecond: true, loadDurationMs: true,
          },
        }),
        ctx.db.llmCall.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      ]);

      return { ...buildMetricsSummary(rows, input.rangeHours), recent, since: since.toISOString() };
    }),
});
