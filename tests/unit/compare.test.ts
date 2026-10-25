import { describe, expect, it } from "vitest";
import type { AnswerMeta } from "@/lib/ask-types";
import { modelKey, modelSizeLabel, parseModelKey, pickWinners } from "@/lib/compare";

const meta = (over: Partial<AnswerMeta>): AnswerMeta => ({ answerWords: 100, totalMs: 1000, ...over }) as AnswerMeta;

describe("modelSizeLabel", () => {
  it("shows the size on disk of a local model", () => {
    expect(modelSizeLabel({ provider: "ollama", model: "qwen2.5-coder:3b-instruct", sizeBytes: 1_929_903_072 })).toBe("1.9 GB on disk");
    expect(modelSizeLabel({ provider: "ollama", model: "tiny", sizeBytes: 274_000_000 })).toBe("274 MB on disk");
  });

  it("reads a parameter count from a cloud model's name", () => {
    expect(modelSizeLabel({ provider: "groq", model: "openai/gpt-oss-20b" })).toBe("≈20B parameters");
    expect(modelSizeLabel({ provider: "groq", model: "qwen/qwen3.8-27b" })).toBe("≈27B parameters");
    expect(modelSizeLabel({ provider: "gemini", model: "gemma-4-31b-it" })).toBe("≈31B parameters");
  });

  it("does not invent a size when the name has none", () => {
    expect(modelSizeLabel({ provider: "gemini", model: "gemini-flash-lite-latest" })).toBe("Cloud-hosted, size not published");
    expect(modelSizeLabel({ provider: "ollama", model: "mystery" })).toBe("Size unknown");
  });
});

describe("pickWinners", () => {
  it("names the best model for each measure", () => {
    const winners = pickWinners([
      { key: "local", meta: meta({ firstTokenMs: 900, totalMs: 9000, tokensPerSecond: 50, answerWords: 80 }) },
      { key: "gemini", meta: meta({ firstTokenMs: 1500, totalMs: 2000, tokensPerSecond: 110, answerWords: 120 }) },
      { key: "groq", meta: meta({ firstTokenMs: 400, totalMs: 1100, tokensPerSecond: 900, answerWords: 220 }) },
    ]);
    expect(winners).toEqual({ firstWord: "groq", total: "groq", speed: "groq", longest: "groq" });
  });

  it("splits the prizes when no model wins everything", () => {
    const winners = pickWinners([
      { key: "a", meta: meta({ firstTokenMs: 100, totalMs: 5000, tokensPerSecond: 20 }) },
      { key: "b", meta: meta({ firstTokenMs: 800, totalMs: 1500, tokensPerSecond: 70 }) },
    ]);
    expect(winners.firstWord).toBe("a");
    expect(winners.total).toBe("b");
  });

  it("names no winner for one model, a tie, or a missing measure", () => {
    expect(pickWinners([{ key: "a", meta: meta({ firstTokenMs: 100 }) }]).firstWord).toBeUndefined();
    expect(pickWinners([{ key: "a", meta: meta({ answerWords: 50 }) }, { key: "b", meta: meta({ answerWords: 50 }) }]).longest).toBeUndefined();
    expect(pickWinners([{ key: "a", meta: meta({}) }, { key: "b", meta: meta({ tokensPerSecond: 40 }) }]).speed).toBeUndefined();
  });
});

describe("model keys", () => {
  it("round-trips, including model names that contain colons or slashes", () => {
    const key = modelKey("ollama", "qwen2.5-coder:3b-instruct");
    expect(parseModelKey(key)).toEqual({ provider: "ollama", model: "qwen2.5-coder:3b-instruct" });
    expect(parseModelKey(modelKey("groq", "openai/gpt-oss-20b"))).toEqual({ provider: "groq", model: "openai/gpt-oss-20b" });
  });
});
