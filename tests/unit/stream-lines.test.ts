import { describe, expect, it } from "vitest";
import { encodeEvent, readEvents, readLines, readSseData } from "@/lib/stream-lines";

/** A byte stream delivered in the given pieces, to imitate how a network splits text. */
function streamOf(...pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe("readLines", () => {
  it("joins a line that the network split in two", async () => {
    expect(await collect(readLines(streamOf("hel", "lo\nwor", "ld\n")))).toEqual(["hello", "world"]);
  });

  it("returns the last line even without a trailing newline", async () => {
    expect(await collect(readLines(streamOf("a\nb")))).toEqual(["a", "b"]);
  });

  it("handles Windows line endings", async () => {
    expect(await collect(readLines(streamOf("a\r\nb\r\n")))).toEqual(["a", "b"]);
  });

  it("does not break a multi-byte character split between two pieces", async () => {
    const bytes = new TextEncoder().encode("é\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    });
    expect(await collect(readLines(stream))).toEqual(["é"]);
  });
});

describe("readSseData", () => {
  it("returns data lines and skips comments, events and the DONE marker", async () => {
    const body = streamOf(": keep-alive\n", "event: x\n", 'data: {"a":1}\n\n', "data: [DONE]\n\n");
    expect(await collect(readSseData(body))).toEqual(['{"a":1}']);
  });
});

describe("readEvents", () => {
  it("parses one JSON event per line and skips damaged lines", async () => {
    const body = streamOf(encodeEvent({ type: "token", text: "Hi" }), "not json\n", encodeEvent({ type: "done" }));
    expect(await collect(readEvents<{ type: string }>(body))).toEqual([{ type: "token", text: "Hi" }, { type: "done" }]);
  });
});
