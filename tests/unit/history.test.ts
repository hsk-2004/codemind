import { describe, expect, it } from "vitest";
import { MAX_HISTORY_TURNS, isFollowUp, retrievalQuery, trimHistory, withHistory } from "@/services/rag/history";

const turn = (n: number) => ({ question: `question ${n}`, answer: `answer ${n}` });

describe("trimHistory", () => {
  it("keeps only the latest turns", () => {
    const trimmed = trimHistory([1, 2, 3, 4, 5].map(turn));
    expect(trimmed).toHaveLength(MAX_HISTORY_TURNS);
    expect(trimmed[trimmed.length - 1]?.question).toBe("question 5");
  });

  it("shortens long answers so they cannot crowd out the retrieved code", () => {
    const [only] = trimHistory([{ question: "q", answer: "x".repeat(5000) }]);
    expect(only!.answer.length).toBeLessThan(700);
  });

  it("drops turns without an answer, and handles undefined", () => {
    expect(trimHistory([{ question: "q", answer: "  " }])).toEqual([]);
    expect(trimHistory(undefined)).toEqual([]);
  });
});

describe("isFollowUp", () => {
  it.each([
    ["and where is it used?", true],
    ["Why does that matter for the whole project?", true],
    ["what about the tests", true],
    ["Where is the authentication middleware configured for admin routes?", false],
  ])("%s -> %s", (question, expected) => {
    expect(isFollowUp(question)).toBe(expected);
  });
});

describe("retrievalQuery", () => {
  it("searches a follow-up together with the question before it", () => {
    expect(retrievalQuery([turn(1)], "and where is it used?")).toBe("question 1\nand where is it used?");
  });

  it("leaves a standalone question alone, and the first question of a chat", () => {
    expect(retrievalQuery([turn(1)], "Where is the authentication middleware configured for admin routes?")).toBe(
      "Where is the authentication middleware configured for admin routes?",
    );
    expect(retrievalQuery([], "and where is it used?")).toBe("and where is it used?");
  });
});

describe("withHistory", () => {
  it("is the plain question when there is no history", () => {
    expect(withHistory("What is this?", [])).toBe("What is this?");
  });

  it("puts earlier turns before the follow-up", () => {
    const text = withHistory("and where is it used?", [turn(1)]);
    expect(text.indexOf("Q: question 1")).toBeLessThan(text.indexOf("Follow-up question: and where is it used?"));
    expect(text).toContain("A: answer 1");
  });
});
