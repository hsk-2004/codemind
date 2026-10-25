import { Document } from "@langchain/core/documents";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "@/services/llm/gemini";
import { GroqProvider } from "@/services/llm/groq";
import { answerModelFromProvider } from "@/services/llm/langchain";
import { OllamaProvider } from "@/services/llm/ollama";
import type { StreamChunk } from "@/services/llm/provider";
import { createDirectStream, createRagChain, createRagStream, type SourceDocument, type SourceMetadata } from "@/services/rag/chain";
import { onLlmCall, type LlmCallEvent } from "@/services/telemetry";

const noWait = { sleep: async () => {} };

function body(lines: string[], splitAt = 7): Response {
  const text = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  // Cut the text at an arbitrary place, as a network would.
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text.slice(0, splitAt)));
        controller.enqueue(encoder.encode(text.slice(splitAt)));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

const textOf = (chunks: StreamChunk[]) => chunks.map((c) => c.text ?? "").join("");
const metricsOf = (chunks: StreamChunk[]) => chunks.find((c) => c.metrics)?.metrics;

afterEach(() => vi.unstubAllGlobals());

describe("OllamaProvider.stream", () => {
  it("yields the text pieces, then the timings from the final line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        body([
          JSON.stringify({ message: { role: "assistant", content: "Hel" }, done: false }),
          JSON.stringify({ message: { role: "assistant", content: "lo" }, done: false }),
          JSON.stringify({ message: { role: "assistant", content: "" }, done: true, eval_count: 2, eval_duration: 1e9, prompt_eval_count: 9 }),
        ]),
      ),
    );
    const chunks = await collect(new OllamaProvider("http://x", "m").stream("hi"));
    expect(textOf(chunks)).toBe("Hello");
    expect(metricsOf(chunks)).toMatchObject({ completionTokens: 2, promptTokens: 9, tokensPerSecond: 2 });
  });

  it("asks Ollama to stream", async () => {
    const fetchMock = vi.fn(async () => body([JSON.stringify({ message: { content: "a" }, done: true })]));
    vi.stubGlobal("fetch", fetchMock);
    await collect(new OllamaProvider("http://x", "m").stream("hi", { system: "be brief" }));
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.stream).toBe(true);
    expect(sent.messages[0]).toEqual({ role: "system", content: "be brief" });
  });

  it("fails when the model reports an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => body([JSON.stringify({ error: "model not found" })])));
    await expect(collect(new OllamaProvider("http://x", "m").stream("hi"))).rejects.toThrow("model not found");
  });
});

describe("GroqProvider.stream", () => {
  const sse = (...objects: unknown[]) => [...objects.map((o) => `data: ${JSON.stringify(o)}\n`), "data: [DONE]"];

  it("yields deltas and reads usage from the last chunk", async () => {
    const fetchMock = vi.fn(async () =>
      body(
        sse(
          { choices: [{ delta: { content: "Hi " } }] },
          { choices: [{ delta: { content: "there" } }] },
          { choices: [], usage: { prompt_tokens: 12, completion_tokens: 4, completion_time: 0.5 } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const chunks = await collect(new GroqProvider("openai/gpt-oss-20b", "key", noWait).stream("q"));
    expect(textOf(chunks)).toBe("Hi there");
    expect(metricsOf(chunks)).toMatchObject({ promptTokens: 12, completionTokens: 4, tokensPerSecond: 8 });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.stream).toBe(true);
    expect(sent.stream_options).toEqual({ include_usage: true });
  });

  it("needs an API key", async () => {
    await expect(collect(new GroqProvider("m", "", noWait).stream("q"))).rejects.toThrow("GROQ_API_KEY");
  });

  it("rejects an empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => body(sse({ choices: [{ delta: {} }] }))));
    await expect(collect(new GroqProvider("m", "key", noWait).stream("q"))).rejects.toThrow("empty answer");
  });
});

describe("GeminiProvider.stream", () => {
  it("uses the streaming endpoint, hides thinking parts and reads token counts", async () => {
    const part = (text: string, thought = false) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text, thought }] } }] })}\n`;
    const fetchMock = vi.fn(async () =>
      body([
        part("planning", true),
        part("Answer "),
        part("here."),
        `data: ${JSON.stringify({ usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 6 } })}\n`,
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const chunks = await collect(new GeminiProvider("gemini-x", "key", noWait).stream("q"));
    expect(textOf(chunks)).toBe("Answer here.");
    expect(metricsOf(chunks)).toMatchObject({ promptTokens: 30, completionTokens: 6 });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(":streamGenerateContent?alt=sse");
  });

  it("reports a blocked prompt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => body([`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n`])));
    await expect(collect(new GeminiProvider("m", "key", noWait).stream("q"))).rejects.toThrow("SAFETY");
  });
});

describe("stream telemetry", () => {
  it("records one call with the final metrics when an operation is given", async () => {
    const events: LlmCallEvent[] = [];
    const off = onLlmCall((e) => events.push(e));
    vi.stubGlobal("fetch", vi.fn(async () => body([JSON.stringify({ message: { content: "ok" }, done: true, eval_count: 1, eval_duration: 1e9 })])));
    await collect(new OllamaProvider("http://x", "m").stream("hi", { operation: "rag_answer" }));
    off();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ operation: "rag_answer", success: true, provider: "ollama", completionTokens: 1 });
  });
});

const doc = (source: string): SourceDocument => new Document<SourceMetadata>({ pageContent: "code", metadata: { source, summary: "s", score: 0.9 } });

describe("streaming through the LangChain chain", () => {
  it("streams the answer in pieces that add up to the whole answer", async () => {
    const pieces: string[] = [];
    const stream = await createRagStream({ llm: new FakeListChatModel({ responses: ["It lives in auth.ts"] }) })([doc("auth.ts")], "Where?");
    for await (const piece of stream) pieces.push(piece);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe("It lives in auth.ts");
  });

  it("puts earlier turns in the prompt of a follow-up", async () => {
    const seen: string[] = [];
    const llm = new FakeListChatModel({ responses: ["ok"] });
    const original = llm._generate.bind(llm);
    llm._generate = async (messages, ...rest) => {
      seen.push(messages.map((m) => String(m.content)).join("\n"));
      return original(messages, ...rest);
    };
    const chain = createRagChain({ llm, retrieve: async () => [doc("a.ts")] });
    await chain("and where is it used?", [{ question: "What is login?", answer: "A function in auth.ts" }]);
    expect(seen.join("")).toContain("Q: What is login?");
    expect(seen.join("")).toContain("Follow-up question: and where is it used?");
  });

  it("streams without retrieval too", async () => {
    const stream = await createDirectStream({ llm: new FakeListChatModel({ responses: ["General answer"] }) })("What?", "owner/repo");
    let text = "";
    for await (const piece of stream) text += piece;
    expect(text).toBe("General answer");
  });
});

describe("answerModelFromProvider", () => {
  const fakeProvider = {
    id: "groq" as const,
    model: "fake",
    stream: async function* (): AsyncGenerator<StreamChunk> {
      yield { text: "Hel" };
      yield { text: "lo" };
      yield { metrics: { completionTokens: 2 } };
    },
  };

  it("streams a cloud provider through the chain and keeps its metrics", async () => {
    const model = answerModelFromProvider(fakeProvider as never);
    const stream = await createDirectStream({ llm: model.llm })("Q", "repo");
    const pieces: string[] = [];
    for await (const piece of stream) pieces.push(piece);
    expect(pieces).toEqual(["Hel", "lo"]);
    expect(model.getMetrics()).toEqual({ completionTokens: 2 });
  });

  it("still answers when the caller does not stream", async () => {
    const model = answerModelFromProvider(fakeProvider as never);
    const answer = await createDirectStream({ llm: model.llm })("Q", "repo");
    let text = "";
    for await (const piece of answer) text += piece;
    expect(text).toBe("Hello");
  });
});
