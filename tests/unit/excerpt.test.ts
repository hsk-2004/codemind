import { Document } from "@langchain/core/documents";
import { describe, expect, it } from "vitest";
import { formatContext, type SourceMetadata } from "@/services/rag/chain";
import { bestExcerpt, keywords } from "@/services/rag/excerpt";

const filler = (n: number, label: string) => Array.from({ length: n }, (_, i) => `const ${label}${i} = ${i};`);

// The relevant function sits far below the top of the file.
const FILE = [
  ...filler(80, "setup"),
  "function sendToWhatsApp(items) {",
  "  const text = encodeURIComponent(items.join(', '));",
  "  window.open(`https://wa.me/?text=${text}`);",
  "}",
  ...filler(80, "other"),
].join("\n");

describe("keywords", () => {
  it("keeps meaningful words and drops filler", () => {
    expect(keywords("How does this app send the list to WhatsApp?")).toEqual(["send", "whatsapp"]);
  });
});

describe("bestExcerpt", () => {
  it("returns the whole file when it fits", () => {
    expect(bestExcerpt("short file", "anything", 100)).toEqual({ text: "short file", startLine: 1, truncated: false });
  });

  it("selects the part of a long file that matches the question, not its beginning", () => {
    const excerpt = bestExcerpt(FILE, "How does the app send the list to WhatsApp?", 600);
    expect(excerpt.truncated).toBe(true);
    expect(excerpt.text).toContain("function sendToWhatsApp(items)");
    expect(excerpt.text).toContain("wa.me");
    expect(excerpt.text).not.toContain("setup0 ");
    expect(excerpt.startLine).toBeGreaterThan(50);
    expect(excerpt.text.length).toBeLessThanOrEqual(600);
  });

  it("falls back to the top of the file when nothing matches", () => {
    const excerpt = bestExcerpt(FILE, "database migrations", 300);
    expect(excerpt.startLine).toBe(1);
    expect(excerpt.text.startsWith("const setup0 = 0;")).toBe(true);
  });

  it("copes with a single line longer than the budget", () => {
    const excerpt = bestExcerpt("x".repeat(5000), "anything", 100);
    expect(excerpt.text).toHaveLength(100);
  });
});

describe("formatContext with a question", () => {
  it("puts the relevant excerpt and its line number into the prompt context", () => {
    const doc = new Document<SourceMetadata>({ pageContent: FILE, metadata: { source: "src/main.js", summary: "s", score: 0.6 } });
    const context = formatContext([doc], { maxCharsPerDoc: 600, maxTotalChars: 5000 }, "send to WhatsApp");
    expect(context).toMatch(/File: src\/main\.js \(excerpt starting at line \d+\)/);
    expect(context).toContain("function sendToWhatsApp(items)");
  });
});
