import { describe, expect, it } from "vitest";
import { pendingResult, type AskResult } from "@/lib/ask-client";
import { MAX_STORED_TURNS, historyFor, restoreTurns, serializeTurns, type Turn } from "@/lib/conversation-storage";
import { NO_CONTEXT_ANSWER } from "@/services/rag/chain";

const result = (over: Partial<AskResult> = {}): AskResult => ({ ...pendingResult("rag"), status: "done", output: "An answer", ...over });
const turn = (n: number, over: Partial<Turn> = {}): Turn => ({ id: `t${n}`, question: `question ${n}`, mode: "rag", results: [result({ output: `answer ${n}` })], ...over });

describe("historyFor", () => {
  it("lists finished questions with their answers, oldest first", () => {
    expect(historyFor([turn(1), turn(2)])).toEqual([
      { question: "question 1", answer: "answer 1" },
      { question: "question 2", answer: "answer 2" },
    ]);
  });

  it("prefers the grounded answer over the one without RAG, and the scaled-up one over both", () => {
    const compare = turn(1, { mode: "compare", results: [result({ mode: "direct", output: "guess" }), result({ mode: "rag", output: "grounded" })] });
    expect(historyFor([compare])[0]?.answer).toBe("grounded");
    const scaled = turn(2, { results: [result({ mode: "auto", output: "small" }), result({ mode: "escalate", output: "large" })] });
    expect(historyFor([scaled])[0]?.answer).toBe("large");
  });

  it("skips unfinished, failed and 'not enough information' turns", () => {
    const turns = [
      turn(1, { results: [result({ status: "error", output: "boom" })] }),
      turn(2, { results: [result({ status: "streaming", output: "half" })] }),
      turn(3, { results: [result({ output: NO_CONTEXT_ANSWER })] }),
    ];
    expect(historyFor(turns)).toEqual([]);
  });
});

describe("serializeTurns / restoreTurns", () => {
  it("round-trips a conversation", () => {
    const turns = [turn(1), turn(2)];
    expect(restoreTurns(serializeTurns(turns)).map((t) => t.question)).toEqual(["question 1", "question 2"]);
  });

  it("keeps only the latest turns", () => {
    const many = Array.from({ length: MAX_STORED_TURNS + 5 }, (_, i) => turn(i));
    const restored = restoreTurns(serializeTurns(many));
    expect(restored).toHaveLength(MAX_STORED_TURNS);
    expect(restored[restored.length - 1]?.question).toBe(`question ${MAX_STORED_TURNS + 4}`);
  });

  it("shortens big code excerpts and long source lists", () => {
    const sources = Array.from({ length: 20 }, (_, i) => ({ fileName: `f${i}.ts`, sourceCode: "x".repeat(9000), summary: "", similarity: 0.5 }));
    const [restored] = restoreTurns(serializeTurns([turn(1, { results: [result({ filesReferences: sources })] })]));
    const files = restored!.results[0]!.filesReferences;
    expect(files).toHaveLength(8);
    expect(files[0]!.sourceCode.length).toBe(1500);
  });

  it("never brings back an answer that was still being written", () => {
    const [restored] = restoreTurns(serializeTurns([turn(1, { results: [result({ status: "streaming", output: "half an ans" })] })]));
    expect(restored!.results[0]).toMatchObject({ status: "stopped", output: "half an ans" });
  });

  it("returns nothing for missing, damaged or wrongly shaped data", () => {
    expect(restoreTurns(null)).toEqual([]);
    expect(restoreTurns("not json")).toEqual([]);
    expect(restoreTurns('{"a":1}')).toEqual([]);
    expect(restoreTurns('[{"id":1}]')).toEqual([]);
  });
});
