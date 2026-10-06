import { Document } from "@langchain/core/documents";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { RunnableLambda } from "@langchain/core/runnables";
import type { ChatPromptValueInterface } from "@langchain/core/prompt_values";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONTEXT_LIMITS,
  NO_CONTEXT_ANSWER,
  contextLimitsFor,
  createDirectChain,
  createRagChain,
  formatContext,
  type SourceDocument,
  type SourceMetadata,
} from "@/services/rag/chain";

function doc(source: string, code: string, score = 0.8): SourceDocument {
  return new Document<SourceMetadata>({
    pageContent: code,
    metadata: { source, summary: `summary of ${source}`, score },
  });
}

describe("formatContext", () => {
  it("includes file path, summary and code for each source", () => {
    const text = formatContext([doc("src/auth.ts", "export function login() {}")]);
    expect(text).toContain("File: src/auth.ts");
    expect(text).toContain("Summary: summary of src/auth.ts");
    expect(text).toContain("export function login() {}");
  });

  it("truncates long files to the per-document limit", () => {
    const text = formatContext([doc("big.ts", "x".repeat(5000))], { maxCharsPerDoc: 100, maxTotalChars: 10_000 });
    expect(text).toContain("... (truncated)");
    expect(text.length).toBeLessThan(300);
  });

  it("stops adding sources once the total budget is used, but always keeps the top one", () => {
    const docs = [doc("a.ts", "a".repeat(400)), doc("b.ts", "b".repeat(400)), doc("c.ts", "c".repeat(400))];
    const text = formatContext(docs, { maxCharsPerDoc: 1000, maxTotalChars: 500 });
    expect(text).toContain("File: a.ts");
    expect(text).not.toContain("File: b.ts");
  });

  it("shares the budget so a long top-ranked file does not push the others out", () => {
    const docs = [doc("long1.ts", "a".repeat(9000)), doc("long2.ts", "b".repeat(9000)), doc("small.json", "c".repeat(300))];
    const text = formatContext(docs, { maxCharsPerDoc: 2000, maxTotalChars: 3000 });
    expect(text).toContain("File: long1.ts");
    expect(text).toContain("File: long2.ts");
    // The small file fits whole and its unused share goes to the long ones.
    expect(text).toContain("c".repeat(300));
    expect(text).toContain("a".repeat(1350));
    expect(text).not.toContain("a".repeat(1351));
  });

  it("uses a smaller context for Groq's free tier than for other cloud models", () => {
    expect(contextLimitsFor("ollama")).toBe(DEFAULT_CONTEXT_LIMITS);
    expect(contextLimitsFor("groq").maxTotalChars).toBeLessThan(contextLimitsFor("gemini").maxTotalChars);
  });
});

describe("createRagChain", () => {
  it("answers honestly without calling the LLM when nothing is retrieved", async () => {
    const llm = RunnableLambda.from(vi.fn(() => "should not be called"));
    const invoke = vi.spyOn(llm, "invoke");
    const answer = createRagChain({ llm, retrieve: async () => [] });

    const result = await answer("How does billing work?");

    expect(result).toEqual({ answer: NO_CONTEXT_ANSWER, sources: [] });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns the model answer together with the retrieved sources", async () => {
    const sources = [doc("src/auth.ts", "export function login() {}", 0.91)];
    const answer = createRagChain({
      llm: new FakeListChatModel({ responses: ["  Login is handled in src/auth.ts.  "] }),
      retrieve: async () => sources,
    });

    const result = await answer("Where is login handled?");

    expect(result.answer).toBe("Login is handled in src/auth.ts.");
    expect(result.sources).toBe(sources);
  });

  it("puts the retrieved code and the question into the prompt sent to the model", async () => {
    let promptText = "";
    const capturingLlm = RunnableLambda.from((prompt: ChatPromptValueInterface) => {
      promptText = prompt.toChatMessages().map((m) => m.content).join("\n");
      return "ok";
    });
    const answer = createRagChain({
      llm: capturingLlm,
      retrieve: async () => [doc("src/db.ts", "const url = process.env.DATABASE_URL")],
    });

    await answer("Where is the database configured?");

    expect(promptText).toContain("File: src/db.ts");
    expect(promptText).toContain("process.env.DATABASE_URL");
    expect(promptText).toContain("Where is the database configured?");
    expect(promptText).toContain("Use ONLY the retrieved repository context");
  });

  it("passes the question to the retriever", async () => {
    const retrieve = vi.fn(async () => []);
    await createRagChain({ llm: new FakeListChatModel({ responses: ["x"] }), retrieve })("What is X?");
    expect(retrieve).toHaveBeenCalledWith("What is X?");
  });
});

describe("createDirectChain (RAG off)", () => {
  it("answers without any repository code in the prompt", async () => {
    let promptText = "";
    const capturingLlm = RunnableLambda.from((prompt: ChatPromptValueInterface) => {
      promptText = prompt.toChatMessages().map((m) => m.content).join("\n");
      return "  A generic guess.  ";
    });

    const answer = await createDirectChain({ llm: capturingLlm })("Where is login handled?", "shop (https://github.com/acme/shop)");

    expect(answer).toBe("A generic guess.");
    expect(promptText).toContain("shop (https://github.com/acme/shop)");
    expect(promptText).toContain("Where is login handled?");
    expect(promptText).toContain("You have NOT been given any files");
    expect(promptText).not.toContain("Retrieved repository context");
  });
});
