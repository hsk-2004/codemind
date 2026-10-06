import { PrismaClient } from "@prisma/client";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgVectorRetriever } from "@/services/rag/retriever";

// Runs only when a real pgvector database is available (CI provides one).
const DATABASE_URL = process.env.DATABASE_URL;
const DIM = 768;

function unitVector(index: number): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[index] = 1;
  return v;
}

function fakeEmbeddings(vector: number[]): EmbeddingsInterface {
  return {
    embedQuery: async () => vector,
    embedDocuments: async (texts: string[]) => texts.map(() => vector),
  };
}

describe.skipIf(!DATABASE_URL)("pgvector retriever (integration)", () => {
  const db = new PrismaClient();
  const suffix = Date.now().toString(36);
  const userId = `test-user-${suffix}`;
  let projectA = "";
  let projectB = "";

  async function addEmbedding(projectId: string, fileName: string, vector: number[]) {
    const row = await db.sourceCodeEmbedding.create({
      data: { projectId, fileName, sourceCode: `// ${fileName}`, summary: `summary ${fileName}` },
    });
    await db.$executeRaw`UPDATE "SourceCodeEmbedding" SET "summaryEmbedding" = ${`[${vector.join(",")}]`}::vector WHERE "id" = ${row.id}`;
  }

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, emailAddress: `${userId}@example.com` } });
    projectA = (await db.project.create({ data: { name: "A", githubUrl: "https://github.com/a/a" } })).id;
    projectB = (await db.project.create({ data: { name: "B", githubUrl: "https://github.com/b/b" } })).id;

    await addEmbedding(projectA, "a/auth.ts", unitVector(0));
    await addEmbedding(projectA, "a/unrelated.ts", unitVector(5));
    // Project B has an identical vector: it would be a perfect match without project filtering.
    await addEmbedding(projectB, "b/secret-auth.ts", unitVector(0));
  });

  afterAll(async () => {
    await db.sourceCodeEmbedding.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
    await db.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("only returns documents from the requested project", async () => {
    const retrieve = createPgVectorRetriever(db, fakeEmbeddings(unitVector(0)), projectA);
    const docs = await retrieve("where is auth?");
    const files = docs.map((d) => d.metadata.source);

    expect(files).toContain("a/auth.ts");
    expect(files).not.toContain("b/secret-auth.ts");
  });

  it("filters out results below the similarity threshold", async () => {
    const retrieve = createPgVectorRetriever(db, fakeEmbeddings(unitVector(0)), projectA, { minScore: 0.5 });
    const files = (await retrieve("auth")).map((d) => d.metadata.source);
    expect(files).toEqual(["a/auth.ts"]);
  });

  it("returns similarity scores in descending order", async () => {
    const mixed = unitVector(0).map((v, i) => (i === 5 ? 0.5 : v));
    const retrieve = createPgVectorRetriever(db, fakeEmbeddings(mixed), projectA, { minScore: 0 });
    const scores = (await retrieve("q")).map((d) => d.metadata.score);
    expect(scores.length).toBe(2);
    expect(scores[0]!).toBeGreaterThan(scores[1]!);
  });

  it("returns nothing for a project with no indexed files", async () => {
    const retrieve = createPgVectorRetriever(db, fakeEmbeddings(unitVector(0)), "no-such-project");
    expect(await retrieve("anything")).toEqual([]);
  });
});
