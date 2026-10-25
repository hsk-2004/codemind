import { describe, expect, it } from "vitest";
import { applyExplainEvent, pendingExplain } from "@/lib/explain-client";
import type { ExplainMeta } from "@/lib/ask-types";

describe("applyExplainEvent", () => {
  it("shows the function list before any explanation text", () => {
    const state = applyExplainEvent(pendingExplain(), { type: "outline", fileName: "a.ts", language: "js", lines: 40, symbols: [{ name: "load", kind: "function", line: 3 }] });
    expect(state.status).toBe("loading");
    expect(state.outline?.symbols).toHaveLength(1);
  });

  it("grows the explanation token by token and then settles on the final text", () => {
    let state = applyExplainEvent(applyExplainEvent(pendingExplain(), { type: "token", text: "## What" }), { type: "token", text: " it does" });
    expect(state).toMatchObject({ status: "streaming", output: "## What it does" });
    state = applyExplainEvent(state, { type: "done", output: "Final text", meta: { model: "m", totalMs: 10, truncated: false, shownLines: 4 } as ExplainMeta });
    expect(state).toMatchObject({ status: "done", output: "Final text" });
    expect(state.meta?.model).toBe("m");
  });

  it("reports an error", () => {
    expect(applyExplainEvent(pendingExplain(), { type: "error", message: "boom" })).toMatchObject({ status: "error", output: "boom" });
  });
});
