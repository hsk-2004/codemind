import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEvent, createTokenCoalescer, pendingResult, stopResult, streamAsk } from "@/lib/ask-client";
import { encodeEvent } from "@/lib/stream-lines";
import type { AnswerMeta, AskEvent } from "@/lib/ask-types";

const meta = { mode: "rag", model: "m", answerWords: 3 } as unknown as AnswerMeta;
const done: AskEvent = { type: "done", output: "Final answer", filesReferences: [], meta };

afterEach(() => vi.unstubAllGlobals());

describe("applyEvent", () => {
  it("shows sources before the first word, then grows the answer token by token", () => {
    let result = pendingResult("rag");
    result = applyEvent(result, { type: "sources", filesReferences: [{ fileName: "a.ts", sourceCode: "", summary: "", similarity: 0.9 }], retrievalMs: 120 });
    expect(result.status).toBe("loading");
    expect(result.filesReferences).toHaveLength(1);
    expect(result.retrievalMs).toBe(120);

    result = applyEvent(applyEvent(result, { type: "token", text: "Hel" }), { type: "token", text: "lo" });
    expect(result.status).toBe("streaming");
    expect(result.output).toBe("Hello");
  });

  it("replaces the streamed text with the final answer and keeps the metadata", () => {
    const result = applyEvent(applyEvent(pendingResult("rag"), { type: "token", text: "partial" }), done);
    expect(result).toMatchObject({ status: "done", output: "Final answer", meta });
  });

  it("turns an error event into an error result", () => {
    expect(applyEvent(pendingResult("rag"), { type: "error", message: "boom" })).toMatchObject({ status: "error", output: "boom" });
  });
});

describe("stopResult", () => {
  it("keeps the words written so far, and leaves finished answers alone", () => {
    const streaming = applyEvent(pendingResult("rag"), { type: "token", text: "half an answ" });
    expect(stopResult(streaming)).toMatchObject({ status: "stopped", output: "half an answ" });
    const finished = applyEvent(streaming, done);
    expect(stopResult(finished).status).toBe("done");
  });
});

describe("createTokenCoalescer", () => {
  it("merges tokens that arrive before the next refresh, and keeps order around other events", () => {
    const emitted: AskEvent[] = [];
    let refresh: () => void = () => {};
    const coalescer = createTokenCoalescer<AskEvent>((e) => emitted.push(e), (flush) => (refresh = flush));

    for (const text of ["a", "b", "c"]) coalescer.push({ type: "token", text });
    expect(emitted).toHaveLength(0);
    refresh();
    expect(emitted).toEqual([{ type: "token", text: "abc" }]);

    coalescer.push({ type: "token", text: "d" });
    coalescer.push(done);
    expect(emitted.map((e) => e.type)).toEqual(["token", "token", "done"]);
    expect(emitted[1]).toEqual({ type: "token", text: "d" });
  });
});

function ndjson(events: AskEvent[]): Response {
  return new Response(events.map(encodeEvent).join(""), { status: 200 });
}

const request = { question: "q", projectId: "p", mode: "rag" as const };
const collect = async (signal?: AbortSignal) => {
  const events: AskEvent[] = [];
  await streamAsk(request, (e) => events.push(e), signal);
  return events;
};

describe("streamAsk", () => {
  it("posts the question and reports every event in order", async () => {
    const fetchMock = vi.fn(async () => ndjson([{ type: "sources", filesReferences: [], retrievalMs: 5 }, { type: "token", text: "Hi" }, done]));
    vi.stubGlobal("fetch", fetchMock);
    const events = await collect();
    expect(events.map((e) => e.type)).toEqual(["sources", "token", "done"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ask");
    expect(JSON.parse(init.body as string)).toMatchObject({ question: "q", projectId: "p", mode: "rag" });
  });

  it("reports a server error message instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "You do not have access to this project" }, { status: 403 })));
    expect(await collect()).toEqual([{ type: "error", message: "You do not have access to this project" }]);
  });

  it("reports a stream that ends before the answer is finished", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "token", text: "cut off" }])));
    const events = await collect();
    expect(events[events.length - 1]).toMatchObject({ type: "error" });
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await collect()).toEqual([{ type: "error", message: "Failed to fetch" }]);
  });

  it("says nothing when the user pressed Stop", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }));
    expect(await collect(controller.signal)).toEqual([]);
  });
});

describe("isDeclined", () => {
  it("recognises the not-enough-information reply, with or without extra text", async () => {
    const { isDeclined, NO_CONTEXT_ANSWER } = await import("@/lib/ask-types");
    expect(isDeclined(NO_CONTEXT_ANSWER)).toBe(true);
    expect(isDeclined(`  ${NO_CONTEXT_ANSWER} More text.`)).toBe(true);
    expect(isDeclined("No, authentication is not part of this project.")).toBe(false);
  });
});
