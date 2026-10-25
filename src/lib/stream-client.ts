import { readEvents } from "./stream-lines";

/**
 * Merges the tokens that arrive between two screen refreshes into one event, so
 * a fast model (hundreds of tokens a second) does not re-render the answer for
 * every token. Other events flush the pending text first, so order is kept.
 */
export function createTokenCoalescer<E extends { type: string }>(
  emit: (event: E) => void,
  schedule: (flush: () => void) => void = (flush) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : setTimeout(flush, 16)),
) {
  let pending = "";
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    if (!pending) return;
    const text = pending;
    pending = "";
    emit({ type: "token", text } as unknown as E);
  };
  return {
    push(event: E) {
      if (event.type === "token") {
        pending += (event as unknown as { text: string }).text;
        if (!scheduled) {
          scheduled = true;
          schedule(flush);
        }
        return;
      }
      flush();
      emit(event);
    },
    flush,
  };
}

/**
 * POSTs a request and reports each streamed event as it arrives. Resolves when
 * the stream is complete, fails, or `signal` is aborted. Never rejects: problems
 * are reported as an `error` event so the screen can show them next to the answer.
 */
export async function streamEvents<E extends { type: string }>(url: string, body: unknown, onEvent: (event: E) => void, signal?: AbortSignal): Promise<void> {
  const coalescer = createTokenCoalescer<E>(onEvent);
  let finished = false;
  const emit = (event: E) => {
    if (event.type === "done" || event.type === "error") finished = true;
    coalescer.push(event);
  };
  const fail = (message: string) => emit({ type: "error", message } as unknown as E);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      fail(detail?.error ?? `The server answered with an error (${response.status}).`);
      return;
    }
    for await (const event of readEvents<E>(response.body)) emit(event);
    if (!finished) fail("The connection closed before the answer was finished.");
  } catch (error) {
    if (signal?.aborted) {
      coalescer.flush();
      return;
    }
    fail(error instanceof Error ? error.message : "Could not reach the server.");
  }
}
