import { describe, expect, it } from "vitest";
import { keywordTerms, reciprocalRankFusion, toTsQuery } from "@/services/rag/fusion";

describe("keywordTerms", () => {
  it("keeps identifiers and drops filler words", () => {
    expect(keywordTerms("How does getCommitHashes work with chunk_size?")).toEqual(["getcommithashes", "chunk_size"]);
  });

  it("removes duplicates and ignores very short words", () => {
    expect(keywordTerms("db db auth auth to")).toEqual(["auth"]);
  });

  it("caps the number of terms", () => {
    expect(keywordTerms("alpha bravo charlie delta echo foxtrot golf hotel india juliet", 3)).toHaveLength(3);
  });

  it("never lets query syntax through", () => {
    const terms = keywordTerms("drop'; table users -- & | ! ( )");
    expect(terms.every((term) => /^[a-z0-9_]+$/.test(term))).toBe(true);
  });

  it("returns nothing for a question with no usable words", () => {
    expect(keywordTerms("how does it work?")).toEqual([]);
  });
});

describe("toTsQuery", () => {
  it("matches any of the terms", () => {
    expect(toTsQuery(["auth", "login"])).toBe("auth | login");
  });
});

describe("reciprocalRankFusion", () => {
  const key = (item: string) => item;

  it("ranks an item found by both lists above items found by one", () => {
    const fused = reciprocalRankFusion([["a", "b", "c"], ["d", "b", "e"]], key).map((entry) => entry.item);
    expect(fused[0]).toBe("b");
    expect(fused).toHaveLength(5);
  });

  it("keeps an item only one list found", () => {
    const fused = reciprocalRankFusion([["a"], ["z"]], key).map((entry) => entry.item);
    expect(fused).toEqual(expect.arrayContaining(["a", "z"]));
  });

  it("prefers higher-ranked items within one list", () => {
    const fused = reciprocalRankFusion([["first", "second", "third"]], key).map((entry) => entry.item);
    expect(fused).toEqual(["first", "second", "third"]);
  });

  it("handles empty input", () => {
    expect(reciprocalRankFusion<string>([[], []], key)).toEqual([]);
  });
});
