import { RecursiveCharacterTextSplitter, type SupportedTextSplitterLanguage } from "@langchain/textsplitters";

/**
 * Function-level chunking for large repositories.
 *
 * File summaries cost one LLM call per file, so only the most important files
 * get one. Chunks need only an embedding, so every indexable file can be split
 * at function and class boundaries and searched precisely, however big the repo.
 */

export interface CodeChunk {
  content: string;
  startLine: number;
  endLine: number;
  /** Name of the function, class or method the chunk starts with, when one is found. */
  symbol: string | null;
}

export const CHUNK_SIZE = 1500;
export const CHUNK_OVERLAP = 150;

const LANGUAGE_BY_EXTENSION: Record<string, SupportedTextSplitterLanguage> = {
  ts: "js", tsx: "js", js: "js", jsx: "js", mjs: "js", cjs: "js", vue: "js", svelte: "js",
  py: "python", java: "java", kt: "java", go: "go", rs: "rust",
  c: "cpp", h: "cpp", cpp: "cpp", hpp: "cpp", cc: "cpp", cs: "java",
  php: "php", rb: "ruby", swift: "swift", scala: "scala",
  md: "markdown", html: "html", sol: "sol",
};

// LangChain's JavaScript separators miss exported and async declarations, common in TypeScript.
const EXTRA_JS_SEPARATORS = [
  "\nexport default ", "\nexport async function ", "\nexport function ", "\nexport class ",
  "\nexport const ", "\nexport interface ", "\nexport type ", "\nasync function ",
];

export function languageFor(path: string): SupportedTextSplitterLanguage | null {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return LANGUAGE_BY_EXTENSION[ext] ?? null;
}

function splitterFor(path: string): RecursiveCharacterTextSplitter {
  const language = languageFor(path);
  const options = { chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP };
  if (!language) return new RecursiveCharacterTextSplitter(options);
  const separators = RecursiveCharacterTextSplitter.getSeparatorsForLanguage(language);
  return new RecursiveCharacterTextSplitter({
    ...options,
    separators: language === "js" ? [...EXTRA_JS_SEPARATORS, ...separators] : separators,
  });
}

const SYMBOL_PATTERNS = [
  /\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, // function foo
  /\bclass\s+([A-Za-z_$][\w$]*)/, // class Foo
  /\bdef\s+([A-Za-z_]\w*)/, // def foo (Python)
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, // func foo (Go)
  /\bfn\s+([A-Za-z_]\w*)/, // fn foo (Rust)
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, // const foo = () =>
];

/** The first function, class or method declared in a chunk, if any. */
export function findSymbol(content: string): string | null {
  for (const line of content.split("\n")) {
    for (const pattern of SYMBOL_PATTERNS) {
      const match = pattern.exec(line);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Splits a file into chunks at function and class boundaries, with their line ranges. */
export async function chunkFile(path: string, code: string): Promise<CodeChunk[]> {
  if (!code.trim()) return [];
  const pieces = await splitterFor(path).splitText(code);
  const chunks: CodeChunk[] = [];
  let cursor = 0;
  for (const piece of pieces) {
    // Chunks overlap, so search from just after the previous chunk's start.
    let index = code.indexOf(piece, cursor);
    if (index === -1) index = code.indexOf(piece);
    const startLine = index === -1 ? 1 : lineOf(code, index);
    if (index !== -1) cursor = index + 1;
    chunks.push({
      content: piece,
      startLine,
      endLine: startLine + piece.split("\n").length - 1,
      symbol: findSymbol(piece),
    });
  }
  return chunks;
}

/** Text that is embedded for a chunk: its location gives the vector context beyond the code itself. */
export function chunkEmbeddingText(path: string, chunk: CodeChunk): string {
  const where = chunk.symbol ? `${path} · ${chunk.symbol}` : path;
  return `File: ${where} (lines ${chunk.startLine}-${chunk.endLine})\n${chunk.content}`;
}
