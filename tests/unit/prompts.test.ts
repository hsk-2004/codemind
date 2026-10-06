import { describe, expect, it } from "vitest";
import {
  CODE_SUMMARY_MAX_CHARS,
  COMMIT_DIFF_MAX_CHARS,
  breakingChangePrompt,
  codeSummaryPrompt,
  commitDiffPrefix,
  commitSummaryPrompt,
} from "@/services/llm/prompts";

describe("commit prompts", () => {
  it("truncate very large diffs to the context budget", () => {
    for (const prompt of [commitSummaryPrompt("~".repeat(20_000), "msg"), breakingChangePrompt("~".repeat(20_000), "msg")]) {
      expect(prompt).toContain("... (truncated)");
      expect(prompt.match(/~/g)?.length).toBe(COMMIT_DIFF_MAX_CHARS);
    }
  });

  it("keep small diffs intact", () => {
    expect(commitSummaryPrompt("+added line")).toContain("+added line");
  });

  it("start with an identical prefix so the model's prompt cache is reused for the diff", () => {
    const diff = "diff --git a/x.ts b/x.ts\n-old\n+new";
    const prefix = commitDiffPrefix(diff, "rename x");
    const summary = commitSummaryPrompt(diff, "rename x");
    const breaking = breakingChangePrompt(diff, "rename x");

    expect(summary.startsWith(prefix)).toBe(true);
    expect(breaking.startsWith(prefix)).toBe(true);
    expect(prefix).toContain(diff);
    // The task instructions differ and come only after the shared part.
    expect(summary.slice(prefix.length)).not.toBe(breaking.slice(prefix.length));
  });

  it("breaking-change prompt contains only valid JSON examples", () => {
    const prompt = breakingChangePrompt("diff", "msg");
    const examples = prompt.split("\n").filter((line) => line.startsWith('{"hasBreakingChanges"'));
    expect(examples.length).toBe(2);
    for (const example of examples) {
      expect(() => JSON.parse(example)).not.toThrow();
    }
  });
});

describe("codeSummaryPrompt", () => {
  it("caps file content", () => {
    const prompt = codeSummaryPrompt("big.ts", "~".repeat(10_000));
    expect(prompt).toContain("big.ts");
    expect(prompt.match(/~/g)?.length).toBe(CODE_SUMMARY_MAX_CHARS);
  });
});
