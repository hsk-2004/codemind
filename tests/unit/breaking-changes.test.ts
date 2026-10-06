import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A console.error spy that outlives its test makes Vitest 3 report the logged,
// already-handled error as a test failure, so spies are restored after each test.
afterEach(() => vi.restoreAllMocks());

const generate = vi.fn<(prompt: string, options?: unknown) => Promise<string>>();

vi.mock("@/services/llm", () => ({
  getLLMProvider: () => ({ generate, stream: vi.fn() }),
}));
vi.mock("@/services/embedding", () => ({
  getEmbeddingProvider: () => ({ embed: vi.fn() }),
}));

const { detectBreakingChanges, AisummariseCommit, extractBasicDiffSummary } = await import("@/lib/ai");

describe("extractBasicDiffSummary", () => {
  it("does not count diff headers as changes and ignores /dev/null", () => {
    const diff = [
      "diff --git a/new.ts b/new.ts",
      "--- /dev/null",
      "+++ b/new.ts",
      "+line one",
      "+line two",
      "diff --git a/old.ts b/old.ts",
      "--- a/old.ts",
      "+++ b/old.ts",
      "-removed",
    ].join("\n");
    expect(extractBasicDiffSummary(diff)).toBe("[AUTO] Changes: +2/-1 in 2 files: new.ts, old.ts");
  });
});

const DIFF = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
-export function getUser(id: string) {}
+export function getUserById(id: string) {}`;

describe("detectBreakingChanges", () => {
  beforeEach(() => generate.mockReset());

  it("parses a breaking-change verdict from the model", async () => {
    generate.mockResolvedValue(
      JSON.stringify({
        hasBreakingChanges: true,
        severity: "high",
        details: "Renamed exported getUser to getUserById",
        affectedComponents: ["src/api.ts"],
        migrationRequired: true,
        migrationSteps: "Replace getUser with getUserById",
      }),
    );

    const result = await detectBreakingChanges(DIFF, "rename getUser");

    expect(result).toEqual({
      analyzed: true,
      hasBreakingChanges: true,
      severity: "high",
      details: "Renamed exported getUser to getUserById",
      affectedComponents: ["src/api.ts"],
      migrationRequired: true,
      migrationSteps: "Replace getUser with getUserById",
    });
  });

  it("requests grammar-constrained JSON output", async () => {
    generate.mockResolvedValue('{"hasBreakingChanges": false}');
    await detectBreakingChanges(DIFF, "msg");
    expect(generate).toHaveBeenCalledWith(expect.stringContaining("Commit message: msg"), expect.objectContaining({ json: true }));
  });

  it("normalises missing or wrongly-typed fields", async () => {
    generate.mockResolvedValue('{"hasBreakingChanges": 1, "affectedComponents": "not-an-array"}');
    const result = await detectBreakingChanges(DIFF, "msg");
    expect(result).toEqual({
      analyzed: true,
      hasBreakingChanges: true,
      severity: null,
      details: null,
      affectedComponents: null,
      migrationRequired: false,
      migrationSteps: null,
    });
  });

  it("falls back to 'no breaking change' when the model returns invalid JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockResolvedValue('{"hasBreakingChanges": boolean,');
    const result = await detectBreakingChanges(DIFF, "msg");
    expect(result.analyzed).toBe(false);
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.severity).toBeNull();
  });

  it("falls back safely when the model is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    const result = await detectBreakingChanges(DIFF, "msg");
    expect(result.analyzed).toBe(false);
    expect(result.hasBreakingChanges).toBe(false);
  });
});

describe("AisummariseCommit", () => {
  beforeEach(() => generate.mockReset());

  it("returns the model summary", async () => {
    generate.mockResolvedValue("[refactor] Renamed getUser");
    expect(await AisummariseCommit(DIFF)).toBe("[refactor] Renamed getUser");
  });

  it("falls back to a deterministic diff summary when the model fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValue(new Error("model unavailable"));
    expect(await AisummariseCommit(DIFF)).toBe("[AUTO] Changes: +1/-1 in 1 files: src/api.ts");
  });

  it("treats an empty model response as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockResolvedValue("");
    expect(await AisummariseCommit(DIFF)).toMatch(/^\[AUTO\]/);
  });
});
