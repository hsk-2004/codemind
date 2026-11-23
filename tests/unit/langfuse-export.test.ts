import http from "node:http";
import { gunzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LangfuseTelemetry, readLangfuseConfig } from "@/services/observability/langfuse";

// A stand-in for the Langfuse server: it only records what it receives.
const bodies: Buffer[] = [];
let server: http.Server;
let url = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.url?.includes("/otel/")) {
        const raw = Buffer.concat(chunks);
        bodies.push(req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw);
      }
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("Langfuse export", () => {
  it("sends a model call with its tokens, grouped under a trace, without secrets", async () => {
    const lf = new LangfuseTelemetry(readLangfuseConfig({ LANGFUSE_PUBLIC_KEY: "pk-test", LANGFUSE_SECRET_KEY: "sk-test", LANGFUSE_BASE_URL: url }));
    expect(lf.enabled).toBe(true);
    await lf.run({ name: "ask-test" }, async () => {
      lf.listener({ operation: "rag_answer", provider: "ollama", model: "qwen-test", success: true, inputChars: 3, latencyMs: 50, promptTokens: 123, completionTokens: 45, input: "key AIza" + "b".repeat(35), output: "answer" });
    });
    await lf.flush();
    await lf.shutdown();
    const text = Buffer.concat(bodies).toString("latin1");
    expect(text).toContain("qwen-test");
    expect(text).toContain("ask-test");
    expect(text).toContain("answer");
    expect(text).not.toContain("AIza");
    expect(text).toContain("[redacted]");
  });

  it("does nothing, and throws nothing, without keys", async () => {
    const lf = new LangfuseTelemetry(readLangfuseConfig({}));
    expect(lf.enabled).toBe(false);
    expect(await lf.run({ name: "x" }, async () => 7)).toBe(7);
  });
});
