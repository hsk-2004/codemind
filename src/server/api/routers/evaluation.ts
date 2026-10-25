import { TRPCError } from "@trpc/server";
import { z } from "zod";
import sampleQuestions from "../../../../eval/codemind-questions.json";
import { getLangChainEmbeddings } from "@/services/embedding";
import { suggestQuestions } from "@/services/rag/eval-questions";
import { runRetrievalEval } from "@/services/rag/eval-run";
import { assertProjectAccess } from "../access";
import { appProcedure, createTRPCRouter } from "../trpc";

const questionSchema = z.object({
  question: z.string().trim().min(3).max(300),
  expectedFiles: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
});

/** The Retrieval lab: scores vector and hybrid retrieval on a set of questions with known answers. */
export const evaluationRouter = createTRPCRouter({
  /** The questions CodeMind itself is evaluated with (see eval/codemind-questions.json). */
  sample: appProcedure.query(() => sampleQuestions),

  /** A starter question set built from the repository's own files. */
  suggest: appProcedure
    .input(z.object({ projectId: z.string(), count: z.number().int().min(3).max(20).default(10) }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
      const files = await ctx.db.sourceCodeEmbedding.findMany({
        where: { projectId: input.projectId },
        select: { fileName: true, sourceCode: true, summary: true },
      });
      return suggestQuestions(files, input.count);
    }),

  run: appProcedure
    .input(z.object({ projectId: z.string(), k: z.number().int().min(1).max(15), questions: z.array(questionSchema).min(1).max(30) }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, ctx.user.userId, input.projectId);
      try {
        return await runRetrievalEval(ctx.db, getLangChainEmbeddings(input.projectId), input.projectId, input.questions, input.k);
      } catch (error) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Could not run the evaluation. Make sure Ollama is running with the embedding model (nomic-embed-text).",
          cause: error,
        });
      }
    }),
});
