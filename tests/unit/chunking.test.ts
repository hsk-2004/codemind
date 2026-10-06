import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, chunkEmbeddingText, chunkFile, findSymbol, languageFor } from "@/services/rag/chunking";
import { groupChunksByFile, type ChunkRow } from "@/services/rag/retriever";

const fn = (name: string, body: number) =>
  [`function ${name}(items) {`, ...Array.from({ length: body }, (_, i) => `  const step${i} = items.length + ${i};`), "}"].join("\n");

// Three functions, each too large to share a chunk with the next.
const FILE = ["import { x } from './x';", "", fn("loadItems", 30), "", fn("sendToWhatsApp", 30), "", fn("renderList", 30)].join("\n");

describe("languageFor", () => {
  it("maps extensions to splitter languages", () => {
    expect(languageFor("src/main.ts")).toBe("js");
    expect(languageFor("app/models.py")).toBe("python");
    expect(languageFor("notes.txt")).toBeNull();
  });
});

describe("findSymbol", () => {
  it("finds declarations in several languages", () => {
    expect(findSymbol("export async function sendToWhatsApp() {")).toBe("sendToWhatsApp");
    expect(findSymbol("class CartStore {")).toBe("CartStore");
    expect(findSymbol("def summarise(code):")).toBe("summarise");
    expect(findSymbol("const send = async (items) => {")).toBe("send");
    expect(findSymbol("// just a comment")).toBeNull();
  });
});

describe("chunkFile", () => {
  it("splits at function boundaries and keeps exact line numbers", async () => {
    const chunks = await chunkFile("src/main.js", FILE);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_SIZE);

    const send = chunks.find((c) => c.symbol === "sendToWhatsApp");
    expect(send).toBeDefined();
    const lines = FILE.split("\n");
    // The reported range points at the real lines of the file.
    expect(lines[send!.startLine - 1]).toBe(send!.content.split("\n")[0]);
    expect(lines.slice(send!.startLine - 1, send!.endLine).join("\n")).toBe(send!.content);
  });

  it("returns nothing for an empty file", async () => {
    expect(await chunkFile("a.ts", "   \n")).toEqual([]);
  });

  it("labels the embedded text with the file, symbol and lines", () => {
    const text = chunkEmbeddingText("src/main.js", { content: "code", startLine: 10, endLine: 20, symbol: "send" });
    expect(text.startsWith("File: src/main.js · send (lines 10-20)\n")).toBe(true);
  });
});

describe("groupChunksByFile", () => {
  const row = (fileName: string, startLine: number, similarity: number, symbol: string | null = null): ChunkRow => ({
    fileName, symbol, startLine, endLine: startLine + 9, content: `code@${startLine}`, similarity,
  });

  it("merges a file's chunks in source order and ranks files by their best chunk", () => {
    const docs = groupChunksByFile([row("b.js", 50, 0.7, "late"), row("a.js", 5, 0.6), row("b.js", 10, 0.5, "early")]);
    expect(docs.map((d) => d.metadata.source)).toEqual(["b.js", "a.js"]);
    expect(docs[0]!.metadata.score).toBe(0.7);
    expect(docs[0]!.pageContent.indexOf("code@10")).toBeLessThan(docs[0]!.pageContent.indexOf("code@50"));
    expect(docs[0]!.metadata.summary).toBe("Function-level match: early (lines 10–19), late (lines 50–59)");
  });
});
