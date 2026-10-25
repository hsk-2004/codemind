import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePushEvent, projectMatchesRepo, verifyGithubSignature } from "@/lib/github-webhook";

const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyGithubSignature", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts a correct signature", () => {
    expect(verifyGithubSignature("s3cret", body, sign("s3cret", body))).toBe(true);
  });

  it("rejects a wrong secret, a changed body and a missing header", () => {
    expect(verifyGithubSignature("s3cret", body, sign("other", body))).toBe(false);
    expect(verifyGithubSignature("s3cret", `${body} `, sign("s3cret", body))).toBe(false);
    expect(verifyGithubSignature("s3cret", body, null)).toBe(false);
  });

  it("rejects malformed headers without throwing", () => {
    expect(verifyGithubSignature("s3cret", body, "sha1=abc")).toBe(false);
    expect(verifyGithubSignature("s3cret", body, "sha256=not-hex")).toBe(false);
    expect(verifyGithubSignature("s3cret", body, "sha256=")).toBe(false);
  });
});

describe("parsePushEvent", () => {
  const payload = {
    ref: "refs/heads/main",
    commits: [{}, {}],
    repository: { full_name: "Owner/Repo", default_branch: "main" },
  };

  it("reads a branch push", () => {
    expect(parsePushEvent(payload)).toEqual({ repo: "owner/repo", branch: "main", defaultBranch: "main", commits: 2 });
  });

  it("ignores tags and malformed payloads", () => {
    expect(parsePushEvent({ ...payload, ref: "refs/tags/v1" })).toBeNull();
    expect(parsePushEvent({})).toBeNull();
    expect(parsePushEvent(null)).toBeNull();
  });
});

describe("projectMatchesRepo", () => {
  it.each([
    ["https://github.com/Owner/Repo", true],
    ["https://github.com/owner/repo.git", true],
    ["github.com/owner/repo/", true],
    ["https://github.com/owner/other", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(projectMatchesRepo(url, "owner/repo")).toBe(expected);
  });
});
