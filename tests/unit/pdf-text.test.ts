import { describe, expect, it } from "vitest";
import { clip, stripMarkdown, toWinAnsi, wrapText } from "@/services/report/pdf-text";

const width = (s: string) => s.length * 10; // every character is 10 wide

describe("toWinAnsi", () => {
  it("keeps ordinary text, accents and typographic punctuation", () => {
    expect(toWinAnsi("Café — “quoted” • done")).toBe("Café — “quoted” • done");
  });

  it("replaces characters the PDF font cannot draw", () => {
    expect(toWinAnsi("a → b ≈ 5 × 2")).toBe("a -> b ~ 5 x 2");
    expect(toWinAnsi("日本語 🙂")).toBe("??? ?");
  });

  it("drops control characters and turns tabs into spaces", () => {
    expect(toWinAnsi("a\u0000b\tc")).toBe("ab  c");
  });
});

describe("stripMarkdown", () => {
  it("makes an AI answer readable as plain text", () => {
    const text = stripMarkdown("## Title\n\nUse `verify()` for **safety**.\n\n- one\n- two\n\n```ts\nconst a = 1\n```");
    expect(text).toContain("Title");
    expect(text).toContain("Use verify() for safety.");
    expect(text).toContain("• one");
    expect(text).toContain("const a = 1");
    expect(text).not.toMatch(/[#`*]/);
  });

  it("keeps the address of a link", () => {
    expect(stripMarkdown("[docs](https://x.dev)")).toBe("docs (https://x.dev)");
  });
});

describe("clip", () => {
  it("cuts at a word and marks the cut, and leaves short text alone", () => {
    expect(clip("short", 20)).toBe("short");
    expect(clip("one two three four five six", 15)).toBe("one two three...");
  });
});

describe("wrapText", () => {
  it("wraps at word boundaries within the width", () => {
    const lines = wrapText("aaa bbb ccc ddd", 70, width);
    expect(lines).toEqual(["aaa bbb", "ccc ddd"]);
    expect(lines.every((l) => width(l) <= 70)).toBe(true);
  });

  it("keeps explicit line breaks and blank lines", () => {
    expect(wrapText("one\n\ntwo", 500, width)).toEqual(["one", "", "two"]);
  });

  it("splits a word that is wider than the line", () => {
    const lines = wrapText("x".repeat(25), 100, width);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((l) => width(l) <= 100)).toBe(true);
    expect(lines.join("")).toBe("x".repeat(25));
  });

  it("returns one empty line for empty text", () => {
    expect(wrapText("", 100, width)).toEqual([""]);
  });
});
