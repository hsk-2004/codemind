/**
 * Indexes a local folder as a CodeMind project, with no GitHub access and no
 * LLM calls: files are split into function-level chunks and embedded with the
 * local embedding model, and each file gets a short rule-based summary.
 * It lets you try Ask AI, the Retrieval lab and Compare models on this very
 * repository, offline.
 *
 * Usage: npm run index:local -- [folder=.] [project name]
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { getLangChainEmbeddings } from "../src/services/embedding";
import { chunkEmbeddingText, chunkFile, languageFor, listSymbols } from "../src/services/rag/chunking";

const INDEXED = /\.(ts|tsx|js|jsx|mjs|py|go|rs|java|md|prisma|sql|yml|yaml)$/i;
const SKIPPED = /(^|\/)(package-lock\.json|bun\.lock|node_modules|\.next|dist|build|coverage|docs\/.*\.pdf)(\/|$)/;
const MAX_FILE_BYTES = 60_000;
const MAX_FILES = 300;
const EMBED_BATCH = 16;

const folder = resolve(process.argv[2] ?? ".");
const name = process.argv[3] ?? basename(folder);
const db = new PrismaClient();

const git = (...args: string[]) => execFileSync("git", args, { cwd: folder, encoding: "utf8" }).trim();

/** Tracked and untracked files that are not ignored, so .gitignore is respected. */
function listFiles(): string[] {
  return git("ls-files", "--cached", "--others", "--exclude-standard")
    .split("\n")
    .filter((path) => path && INDEXED.test(path) && !SKIPPED.test(path) && existsSync(resolve(folder, path)))
    .filter((path) => statSync(resolve(folder, path)).size <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES);
}

/** A short description made without an LLM: the file's own first comment, and what it declares. */
function summarize(path: string, code: string): string {
  // Prefer the file's own words: the first comment or heading that reads like a sentence.
  const firstLine = code
    .split("\n")
    .filter((line) => /^\s*(\/\*\*?|\*(?!\/)|\/\/|#+\s|"""|\'\'\')/.test(line))
    .map((line) => line.replace(/^\s*(\/\*\*?|\*\/|\*|\/\/|#+|"""|\'\'\')\s?/, "").replace(/\s*\*\/\s*$/, "").replace(/[.:]$/, "").trim())
    .find((line) => /^[A-Za-z][^{}<>=;`]{20,}$/.test(line) && !/^(eslint|@ts-|prettier|use client|use server)/i.test(line));
  const symbols = [...new Set(listSymbols(code, 12).map((s) => s.name))].slice(0, 8);
  const defines = symbols.length > 0 ? ` Defines: ${symbols.join(", ")}.` : "";
  return `${path}: ${firstLine ?? languageFor(path) ?? "source file"}.${defines}`.slice(0, 400);
}

async function embedAll(embeddings: ReturnType<typeof getLangChainEmbeddings>, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) vectors.push(...(await embeddings.embedDocuments(texts.slice(i, i + EMBED_BATCH))));
  return vectors;
}

async function main() {
  const files = listFiles();
  if (files.length === 0) throw new Error(`No indexable files found in ${folder}`);

  let githubUrl: string;
  try {
    githubUrl = git("remote", "get-url", "origin").replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
  } catch {
    githubUrl = `https://github.com/local/${name}`;
  }

  const userId = "local-user";
  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, emailAddress: "local@codemind.local", firstName: "Local", lastName: "User" },
  });

  const existing = await db.project.findFirst({ where: { name, githubUrl, deletedAt: null } });
  const project = existing ?? (await db.project.create({ data: { name, githubUrl, UserToProjects: { create: { userId } } } }));
  if (existing) {
    await db.$transaction([
      db.codeChunk.deleteMany({ where: { projectId: project.id } }),
      db.sourceCodeEmbedding.deleteMany({ where: { projectId: project.id } }),
    ]);
    console.log(`Re-indexing existing project "${name}"`);
  }

  const embeddings = getLangChainEmbeddings(project.id);
  const started = Date.now();
  let chunkTotal = 0;

  for (const [index, path] of files.entries()) {
    const code = readFileSync(resolve(folder, path), "utf8");
    if (!code.trim()) continue;

    const summary = summarize(path, code);
    const [summaryVector] = await embedAll(embeddings, [summary]);
    const row = await db.sourceCodeEmbedding.create({ data: { projectId: project.id, fileName: path, sourceCode: code, summary } });
    await db.$executeRaw`UPDATE "SourceCodeEmbedding" SET "summaryEmbedding" = ${`[${summaryVector!.join(",")}]`}::vector WHERE "id" = ${row.id}`;

    const chunks = await chunkFile(path, code);
    const vectors = await embedAll(embeddings, chunks.map((c) => chunkEmbeddingText(path, c)));
    for (const [i, chunk] of chunks.entries()) {
      await db.$executeRaw`
        INSERT INTO "CodeChunk" ("id", "projectId", "fileName", "symbol", "startLine", "endLine", "content", "embedding")
        VALUES (${randomUUID()}, ${project.id}, ${path}, ${chunk.symbol}, ${chunk.startLine}, ${chunk.endLine}, ${chunk.content}, ${`[${vectors[i]!.join(",")}]`}::vector)`;
    }
    chunkTotal += chunks.length;
    console.log(`[${index + 1}/${files.length}] ${path}: ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`);
  }

  console.log(`\nIndexed ${files.length} files and ${chunkTotal} chunks in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  console.log(`Project id: ${project.id}\nOpen http://localhost:3000, pick "${name}" in the sidebar, or run: npm run eval -- ${project.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
