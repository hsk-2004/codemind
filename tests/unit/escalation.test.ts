import { Document } from "@langchain/core/documents";
import { describe, expect, it } from "vitest";
import { NO_CONTEXT_ANSWER, type SourceDocument, type SourceMetadata } from "@/services/rag/chain";
import { escalationReason, modelTiers } from "@/services/rag/escalation";

const doc = (source: string): SourceDocument =>
  new Document<SourceMetadata>({ pageContent: "code", metadata: { source, summary: "s", score: 0.6 } });

const sources = [doc("src/main.js"), doc("index.html")];

describe("escalationReason", () => {
  it("keeps an answer that cites a retrieved file", () => {
    expect(escalationReason("It uses `sendToWhatsApp()` in `src/main.js`.", sources)).toBeNull();
  });

  it("accepts a citation by file name only", () => {
    expect(escalationReason("See main.js for the send logic.", sources)).toBeNull();
  });

  it("recommends scaling up when the model could not answer", () => {
    expect(escalationReason(NO_CONTEXT_ANSWER, sources)).toBe("no_answer");
  });

  it("recommends scaling up when the answer cites none of the retrieved files", () => {
    expect(escalationReason("It is probably done in send_to_whatsapp.py.", sources)).toBe("no_citation");
  });

  it("never recommends scaling up when nothing was retrieved", () => {
    expect(escalationReason("anything", [])).toBeNull();
  });
});

describe("modelTiers", () => {
  it("orders tiers from the local model up to the configured cloud models", () => {
    expect(modelTiers("qwen", { groq: "gpt-oss", gemini: "flash" })).toEqual([
      { provider: "ollama", model: "qwen" },
      { provider: "groq", model: "gpt-oss" },
      { provider: "gemini", model: "flash" },
    ]);
  });

  it("has only the local tier when no cloud model is configured", () => {
    expect(modelTiers("qwen", {})).toEqual([{ provider: "ollama", model: "qwen" }]);
  });
});
