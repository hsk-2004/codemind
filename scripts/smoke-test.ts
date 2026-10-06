/**
 * Live end-to-end check of the real local AI stack (no mocks):
 * Ollama + models, PostgreSQL/pgvector, retrieval, a full RAG answer,
 * breaking-change detection and GitHub repository analysis.
 *
 * Usage: npm run smoke [-- <projectId>]
 */
import { PrismaClient } from "@prisma/client";
import { detectBreakingChanges } from "../src/lib/ai";
import { analyzeRepoTree } from "../src/lib/repo-insights";
import { fetchRepoTree } from "../src/lib/repo-tree";
import { getSystemStatus } from "../src/server/system-status";
import { getLangChainEmbeddings } from "../src/services/embedding";
import { getChatModel } from "../src/services/llm/langchain";
import { createRagChain } from "../src/services/rag/chain";
import { createPgVectorRetriever } from "../src/services/rag/retriever";

const db = new PrismaClient();
let failures = 0;

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`✔ ${name} (${Date.now() - start}ms)`);
    return result;
  } catch (error) {
    failures++;
    console.log(`✘ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function main() {
  const status = await step("System status", async () => {
    const s = await getSystemStatus(db);
    if (!s.ollama.ok) throw new Error(s.ollama.detail);
    if (!s.database.ok) throw new Error(s.database.detail);
    if (!s.llm.installed) throw new Error(`LLM ${s.llm.model} not installed`);
    if (!s.embedding.installed) throw new Error(`Embedding model ${s.embedding.model} not installed`);
    return s;
  });
  if (status) {
    console.log(`  Ollama ${status.ollama.latencyMs}ms · LLM ${status.llm.model} · embeddings ${status.embedding.model} · pgvector ${status.database.pgvectorVersion} · Qdrant ${status.qdrant.ok ? "up" : "down"}`);
  }

  const requested = process.argv[2];
  const project = await db.project.findFirst({
    where: requested ? { id: requested } : { deletedAt: null, sourceCodeEmbeddings: { some: {} } },
    orderBy: { createdAt: "desc" },
  });

  if (!project) {
    failures++;
    console.log("✘ No indexed project found. Connect a repository in the app first.");
  } else {
    console.log(`\nProject: ${project.name} (${project.githubUrl})`);
    const retrieve = createPgVectorRetriever(db, getLangChainEmbeddings(), project.id);

    await step("Semantic search", async () => {
      const docs = await retrieve("What is the main purpose of this application?");
      if (docs.length === 0) throw new Error("No documents retrieved");
      for (const d of docs) console.log(`  ${(d.metadata.score * 100).toFixed(0).padStart(3)}%  ${d.metadata.source}`);
    });

    await step("RAG answer (LangChain + ChatOllama)", async () => {
      const answer = createRagChain({ llm: getChatModel(), retrieve });
      const result = await answer("What does this project do? Answer in two sentences.");
      if (!result.answer.trim()) throw new Error("Empty answer");
      console.log(`  Sources: ${result.sources.map((s) => s.metadata.source).join(", ") || "none"}`);
      console.log(`  Answer: ${result.answer.replace(/\s+/g, " ").slice(0, 400)}`);
    });

    await step("Repository analysis (GitHub tree)", async () => {
      const tree = await fetchRepoTree(project.githubUrl);
      const insights = analyzeRepoTree(tree.paths);
      console.log(`  ${insights.totalFiles} files · ${insights.languages.slice(0, 3).map((l) => `${l.language} ${l.percent}%`).join(", ")}`);
      console.log(`  Docker: ${insights.docker.dockerfiles.length > 0} · CI: ${insights.ci.map((c) => c.name).join(", ") || "none"} · Tests: ${insights.tests.testFiles} files`);
    });
  }

  await step("Breaking-change detection (live LLM)", async () => {
    const diff = [
      "diff --git a/src/api.ts b/src/api.ts",
      "--- a/src/api.ts",
      "+++ b/src/api.ts",
      "-export function getUser(id: string): User {",
      "+export function fetchUserById(id: number): Promise<User> {",
    ].join("\n");
    const result = await detectBreakingChanges(diff, "Rename getUser and make it async");
    if (!result.analyzed) throw new Error("Model did not return a usable verdict");
    console.log(`  Breaking: ${result.hasBreakingChanges} · severity: ${result.severity} · ${result.details ?? ""}`);
  });

  await db.$disconnect();
  console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
