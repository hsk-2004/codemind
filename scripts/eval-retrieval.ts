/**
 * Evaluation lab: measures how well retrieval finds the right files for a fixed
 * question set, comparing vector-only search with hybrid (vector + keyword) search.
 * Needs a project that is already indexed. Embeddings run locally (Ollama).
 *
 * Usage: npm run eval -- <projectId> [questions.json] [k]
 *   e.g. npm run eval -- cmabc123 eval/codemind-questions.json 6
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { getLangChainEmbeddings } from "../src/services/embedding";
import type { EvalQuestion } from "../src/services/rag/eval-metrics";
import { runRetrievalEval, type StrategyResult } from "../src/services/rag/eval-run";

const [projectIdArg, questionsPath = "eval/codemind-questions.json", kArg = "6"] = process.argv.slice(2);
if (!projectIdArg) {
  console.error("Usage: npm run eval -- <projectId> [questions.json] [k]");
  process.exit(1);
}

const projectId: string = projectIdArg;
const k = Number(kArg);
const questions = JSON.parse(readFileSync(questionsPath, "utf8")) as EvalQuestion[];
const db = new PrismaClient();
const embeddings = getLangChainEmbeddings(projectId);

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

try {
  const report = await runRetrievalEval(db, embeddings, projectId, questions, k);
  const [vector, hybrid] = report.strategies as [StrategyResult, StrategyResult];

  console.log(`\n### Retrieval evaluation — ${questions.length} questions, top ${k}, ${report.level}-level index\n`);
  console.log(`| Strategy | Hit rate@${k} | MRR | Precision@${k} | Avg time / question |`);
  console.log("|---|---|---|---|---|");
  for (const { mode, metrics: m, avgMs } of report.strategies) {
    console.log(`| ${mode} | ${pct(m.hitRate)} | ${m.mrr.toFixed(2)} | ${pct(m.precision)} | ${avgMs.toFixed(0)} ms |`);
  }

  console.log("\nMisses (no expected file in the top results):");
  for (const strategy of [vector, hybrid]) {
    for (const r of strategy.questions.filter((r) => r.hitRank === 0)) console.log(`- [${strategy.mode}] ${r.question}`);
  }
} finally {
  await db.$disconnect();
}
