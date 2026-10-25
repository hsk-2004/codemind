import { NextResponse } from "next/server";
import { env } from "@/env";
import { parsePushEvent, projectMatchesRepo, verifyGithubSignature } from "@/lib/github-webhook";
import { pollCommits } from "@/lib/github";
import { db } from "@/server/db";

/**
 * GitHub webhook receiver. On a push to the default branch, the matching
 * CodeMind projects fetch and analyse the new commits automatically, so the
 * dashboard stays current without anyone pressing a button.
 */
export async function POST(request: Request) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });

  const rawBody = await request.text();
  if (!verifyGithubSignature(secret, rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "push") return NextResponse.json({ ignored: `event ${event ?? "unknown"}` }, { status: 202 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const push = parsePushEvent(payload);
  if (!push) return NextResponse.json({ ignored: "not a branch push" }, { status: 202 });
  if (push.branch !== push.defaultBranch) {
    return NextResponse.json({ ignored: `push to ${push.branch}, not ${push.defaultBranch}` }, { status: 202 });
  }

  const projects = (await db.project.findMany({ where: { deletedAt: null }, select: { id: true, githubUrl: true } })).filter(
    (project) => projectMatchesRepo(project.githubUrl, push.repo),
  );

  // Analysis takes a while on local models, so answer GitHub now and work in the background.
  for (const project of projects) {
    void pollCommits(project.id).catch((error: unknown) => console.error(`webhook: analysis failed for ${project.id}`, error));
  }
  return NextResponse.json({ accepted: projects.length, repo: push.repo }, { status: 202 });
}
