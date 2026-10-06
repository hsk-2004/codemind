import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { projectRouter } from "./routers/project";
import { metricsRouter } from "./routers/metrics";
import { modelsRouter } from "./routers/models";
import { systemRouter } from "./routers/system";

export const appRouter = createTRPCRouter({
  project: projectRouter,
  system: systemRouter,
  metrics: metricsRouter,
  models: modelsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
