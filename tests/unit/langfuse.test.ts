import { describe, expect, it } from "vitest";
import { clip, prepareContent, prepareGeneration, readLangfuseConfig, redactSecrets } from "@/services/observability/langfuse";
import type { LlmCallEvent } from "@/services/telemetry";

const base: LlmCallEvent = { operation: "rag_answer", provider: "ollama", model: "m", success: true, inputChars: 5, latencyMs: 1000 } as LlmCallEvent;
const open = { captureContent: true, maxContentChars: 50 };

describe("readLangfuseConfig", () => {
  it("is off without keys", () => expect(readLangfuseConfig({}).enabled).toBe(false));
  it("is on with both keys and accepts alternative address names", () => {
    const c = readLangfuseConfig({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_HOST: "https://x.test/" });
    expect(c.enabled).toBe(true);
    expect(c.baseUrl).toBe("https://x.test");
  });
  it("can be switched off, and content capture too", () => {
    expect(readLangfuseConfig({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_ENABLED: "false" }).enabled).toBe(false);
    expect(readLangfuseConfig({ LANGFUSE_CAPTURE_CONTENT: "false" }).captureContent).toBe(false);
  });
});

describe("content safety", () => {
  it("redacts keys", () => expect(redactSecrets("k=AIza" + "a".repeat(35))).toBe("k=[redacted]"));
  it("clips long text and says so", () => expect(clip("a".repeat(20), 5)).toContain("15 more characters"));
  it("keeps chat messages as messages", () => {
    expect(prepareContent([{ role: "user", content: "hi" }], 50)).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("prepareGeneration", () => {
  it("maps tokens, timings and content", () => {
    const g = prepareGeneration({ ...base, promptTokens: 10, completionTokens: 4, firstTokenMs: 200, input: "q", output: "a" }, open, new Date(5000));
    expect(g.attributes.usageDetails).toEqual({ input: 10, output: 4, total: 14 });
    expect(g.startTime.getTime()).toBe(4000);
    expect(g.attributes.input).toBe("q");
    expect(g.attributes.level).toBe("DEFAULT");
  });
  it("omits usage when no tokens are known and hides content when asked", () => {
    const g = prepareGeneration({ ...base, input: "q", output: "a" }, { ...open, captureContent: false });
    expect(g.attributes.usageDetails).toBeUndefined();
    expect(g.attributes.input).toBeUndefined();
  });
  it("marks failures and cancellations, and embeddings", () => {
    expect(prepareGeneration({ ...base, success: false, error: "boom" }, open).attributes.level).toBe("ERROR");
    expect(prepareGeneration({ ...base, success: false, error: "cancelled" }, open).attributes.level).toBe("WARNING");
    expect(prepareGeneration({ ...base, operation: "embedding" }, open).type).toBe("embedding");
  });
});
