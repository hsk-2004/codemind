import { createHmac, timingSafeEqual } from "node:crypto";
import { parseGithubUrl } from "@/lib/github-url";

/**
 * Checks GitHub's `X-Hub-Signature-256` header: an HMAC-SHA256 of the raw
 * request body, keyed with the webhook secret. Compared in constant time.
 */
export function verifyGithubSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export interface PushEvent {
  /** `owner/repo`, lower-cased for matching against stored project URLs. */
  repo: string;
  branch: string;
  defaultBranch: string;
  commits: number;
}

/** Reads the fields CodeMind needs from a `push` payload, or null when it is not one. */
export function parsePushEvent(payload: unknown): PushEvent | null {
  const body = payload as {
    ref?: unknown;
    commits?: unknown;
    repository?: { full_name?: unknown; default_branch?: unknown };
  };
  const { ref, repository } = body ?? {};
  if (typeof ref !== "string" || !ref.startsWith("refs/heads/")) return null;
  if (typeof repository?.full_name !== "string") return null;
  return {
    repo: repository.full_name.toLowerCase(),
    branch: ref.slice("refs/heads/".length),
    defaultBranch: typeof repository.default_branch === "string" ? repository.default_branch : "main",
    commits: Array.isArray(body.commits) ? body.commits.length : 0,
  };
}

/** True when a stored project URL points at the `owner/repo` of a webhook event. */
export function projectMatchesRepo(githubUrl: string, repo: string): boolean {
  try {
    const { owner, repo: name } = parseGithubUrl(githubUrl);
    return `${owner}/${name}`.toLowerCase() === repo;
  } catch {
    return false;
  }
}
