/**
 * Reads a byte stream (a fetch body) as text lines, however the network split it.
 * The same reader parses Ollama's NDJSON, the cloud providers' server-sent events
 * and CodeMind's own streamed answers in the browser.
 */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        yield pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    if (pending.trim()) yield pending.replace(/\r$/, "");
  } finally {
    reader.releaseLock();
  }
}

/** Payloads of a server-sent-events stream: the text after `data:`, without the `[DONE]` marker. */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of readLines(body)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (data && data !== "[DONE]") yield data;
  }
}

/** One JSON event per line, the format CodeMind streams answers in. */
export const encodeEvent = (event: unknown): string => `${JSON.stringify(event)}\n`;

/** Parses a streamed NDJSON body into events, skipping blank or damaged lines. */
export async function* readEvents<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  for await (const line of readLines(body)) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line) as T;
    } catch {
      // A damaged line must not end the whole answer.
    }
  }
}
