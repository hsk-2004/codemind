import { describe, expect, it } from "vitest";
import { codeForModel } from "@/server/explain";

describe("codeForModel", () => {
  it("gives the whole file when it fits", () => {
    expect(codeForModel("a\nb\nc", 100)).toEqual({ text: "a\nb\nc", truncated: false, shownLines: 3 });
  });

  it("cuts a long file at a line break, never in the middle of a line", () => {
    const code = ["first line", "second line", "third line"].join("\n");
    const result = codeForModel(code, 15);
    expect(result.truncated).toBe(true);
    expect(result.text).toBe("first line");
    expect(result.shownLines).toBe(1);
  });

  it("still returns something for one very long line", () => {
    const result = codeForModel("x".repeat(50), 10);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
