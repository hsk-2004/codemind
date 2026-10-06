import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { saveActiveModel } from "@/server/model-settings";
import { PROVIDER_INFO, getActiveModel, isProviderConfigured } from "@/services/llm";
import { listAvailableModels } from "@/services/llm/catalog";
import { embeddingConfig } from "@/services/llm/config";
import { appProcedure, createTRPCRouter } from "../trpc";

export const modelsRouter = createTRPCRouter({
  /** Available chat models per provider, plus the one currently in use. */
  list: appProcedure.input(z.object({ refresh: z.boolean().optional() }).optional()).query(async ({ input }) => {
    const catalog = await listAvailableModels(input?.refresh ?? false);
    const active = getActiveModel();
    return {
      active: { ...active, ...PROVIDER_INFO[active.provider] },
      embeddingModel: embeddingConfig.model,
      providers: catalog.map((entry) => ({ ...entry, ...PROVIDER_INFO[entry.provider] })),
    };
  }),

  setActive: appProcedure
    .input(z.object({ provider: z.enum(["ollama", "gemini", "groq"]), model: z.string().trim().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (!isProviderConfigured(input.provider)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${PROVIDER_INFO[input.provider].label} is not configured. Add its API key to .env and restart.`,
        });
      }
      // Only models the provider actually lists can be selected.
      const catalog = await listAvailableModels();
      const entry = catalog.find((c) => c.provider === input.provider);
      if (entry && entry.models.length > 0 && !entry.models.some((m) => m.model === input.model)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Model "${input.model}" is not available from ${PROVIDER_INFO[input.provider].label}.` });
      }
      await saveActiveModel(ctx.db, input);
      return { ...input, ...PROVIDER_INFO[input.provider] };
    }),
});
