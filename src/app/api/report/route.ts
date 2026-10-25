import { z } from "zod";
import { db } from "@/server/db";
import { ensureLocalUser } from "@/server/local-user";
import { gatherReportData } from "@/server/report-data";
import { assertAskAccess } from "@/server/ask";
import { buildReportPdf } from "@/services/report/build-pdf";

export const dynamic = "force-dynamic";

const flag = z.enum(["0", "1"]).default("1").transform((v) => v === "1");
const querySchema = z.object({ projectId: z.string().min(1), languages: flag, breaking: flag, answers: flag, aiUsage: flag });

/** Builds and downloads the project report as a PDF. Only the sections switched on are included. */
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Missing or invalid project" }, { status: 400 });
  const { projectId, ...options } = parsed.data;

  try {
    await assertAskAccess(db, await ensureLocalUser(db), projectId);
  } catch {
    return Response.json({ error: "You do not have access to this project" }, { status: 403 });
  }

  try {
    const data = await gatherReportData(db, projectId);
    const pdf = await buildReportPdf(data, options);
    const name = data.project.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("report failed", error);
    return Response.json({ error: "Could not build the report." }, { status: 500 });
  }
}
