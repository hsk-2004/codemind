import { createTRPCRouter, appProcedure } from "../trpc";
import { getSystemStatus } from "@/server/system-status";

export const systemRouter = createTRPCRouter({
  status: appProcedure.query(({ ctx }) => getSystemStatus(ctx.db)),
});
