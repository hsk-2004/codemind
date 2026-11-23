import { PrismaClient } from "@prisma/client";

import { env } from "@/env";
import { registerLangfuse } from "@/services/observability/langfuse";
import { registerTelemetrySink } from "./telemetry-sink";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

registerTelemetrySink(db);
// Sends every model call to Langfuse when its keys are set; does nothing otherwise.
registerLangfuse();
