import { z } from "zod";
import { db } from "@/server/db";
import { assertAskAccess, runAsk } from "@/server/ask";
import { ensureLocalUser } from "@/server/local-user";
import { errorMessage, ndjsonResponse } from "@/server/ndjson-response";

// A local model can take a while on a slow machine.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().trim().min(1, "Question cannot be empty").max(4000),
  projectId: z.string().min(1),
  mode: z.enum(["rag", "direct", "auto", "escalate"]).default("rag"),
  history: z.array(z.object({ question: z.string().max(4000), answer: z.string().max(20_000) })).max(10).optional(),
  model: z.object({ provider: z.enum(["ollama", "gemini", "groq"]), model: z.string().trim().min(1).max(200) }).optional(),
});

/**
 * Streams an answer as newline-delimited JSON events: `sources`, many `token`
 * events, then `done` (or `error`). Closing the connection stops the model.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const input = parsed.data;

  // Checked before streaming starts, so a missing project is a proper 403.
  const userId = await ensureLocalUser(db);
  try {
    await assertAskAccess(db, userId, input.projectId);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 403 });
  }

  return ndjsonResponse(request, (signal) => runAsk(db, userId, { ...input, signal }));
}
