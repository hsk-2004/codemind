import { z } from "zod";
import { db } from "@/server/db";
import { loadFileForExplain, runExplain } from "@/server/explain";
import { ensureLocalUser } from "@/server/local-user";
import { ndjsonResponse } from "@/server/ndjson-response";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const bodySchema = z.object({ fileId: z.string().min(1) });

/** Streams a plain-language explanation of one indexed file as newline-delimited JSON events. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing file" }, { status: 400 });

  const loaded = await loadFileForExplain(db, await ensureLocalUser(db), parsed.data.fileId);
  if (loaded.status !== 200) return Response.json({ error: loaded.error }, { status: loaded.status });

  return ndjsonResponse(request, (signal) => runExplain(db, loaded.file, signal));
}
