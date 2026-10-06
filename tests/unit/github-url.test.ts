import { describe, expect, it } from "vitest";
import { parseGithubUrl } from "@/lib/github-url";

describe("parseGithubUrl", () => {
  it.each([
    ["https://github.com/hsk-2004/Rashan-Tracker", "hsk-2004", "Rashan-Tracker"],
    ["https://github.com/hsk-2004/Rashan-Tracker/", "hsk-2004", "Rashan-Tracker"],
    ["https://github.com/vercel/next.js.git", "vercel", "next.js"],
    ["github.com/owner/repo", "owner", "repo"],
    ["https://www.github.com/owner/repo?tab=readme", "owner", "repo"],
    ["  https://github.com/owner/repo  ", "owner", "repo"],
  ])("parses %s", (url, owner, repo) => {
    expect(parseGithubUrl(url)).toEqual({ owner, repo });
  });

  it.each([
    "https://gitlab.com/owner/repo",
    "https://github.com/owner",
    "not a url",
    "https://github.com/owner/repo/tree/main/src",
    "",
  ])("rejects %s", (url) => {
    expect(() => parseGithubUrl(url)).toThrow(/Invalid GitHub repository URL/);
  });
});
