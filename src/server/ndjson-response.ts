import { encodeEvent } from "@/lib/stream-lines";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Please try again.");

/**
 * Turns an async generator of events into a streamed newline-delimited JSON
 * response. A failure becomes a final `error` event, and closing the connection
 * (the request's signal) stops the generator, and so the model.
 */
export function ndjsonResponse<E>(request: Request, events: (signal: AbortSignal) => AsyncIterable<E>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events(request.signal)) controller.enqueue(encoder.encode(encodeEvent(event)));
      } catch (error) {
        // A cancelled request has nobody left to read the message.
        if (!request.signal.aborted) controller.enqueue(encoder.encode(encodeEvent({ type: "error", message: errorMessage(error) })));
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export { errorMessage };
