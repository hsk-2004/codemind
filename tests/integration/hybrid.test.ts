import { PrismaClient } from "@prisma/client";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHybridChunkRetriever, searchChunksByKeyword } from "@/services/rag/retriever";

// Runs only when a real pgvector database is available (CI provides one).
const DATABASE_URL = process.env.DATABASE_URL;
const DIM = 768;

const unitVector = (index: number) => {
  const v = new Array<number>(DIM).fill(0);
  v[index] = 1;
  return v;
};

const fakeEmbeddings = (vector: number[]): EmbeddingsInterface => ({
  embedQuery: async () => vector,
  embedDocuments: async (texts: string[]) => texts.map(() => vector),
});

describe.skipIf(!DATABASE_URL)("hybrid retrieval (integration)", () => {
  const db = new PrismaClient();
  const suffix = Date.now().toString(36);
  let projectA = "";
  let projectB = "";

  async function addChunk(projectId: string, fileName: string, symbol: string, content: string, vector: number[]) {
    const id = `${projectId}-${fileName}`;
    await db.$executeRaw`
      INSERT INTO "CodeChunk" ("id", "projectId", "fileName", "symbol", "startLine", "endLine", "content", "embedding")
      VALUES (${id}, ${projectId}, ${fileName}, ${symbol}, 1, 10, ${content}, ${`[${vector.join(",")}]`}::vector)`;
  }

  beforeAll(async () => {
    projectA = (await db.project.create({ data: { name: `hybrid-a-${suffix}`, githubUrl: "https://github.com/a/a" } })).id;
    projectB = (await db.project.create({ data: { name: `hybrid-b-${suffix}`, githubUrl: "https://github.com/b/b" } })).id;

    // The vector search prefers vec.ts; only auth.ts literally mentions the identifier.
    await addChunk(projectA, "vec.ts", "other", "function other() { return 1 }", unitVector(0));
    await addChunk(projectA, "auth.ts", "verifyGithubSignature", "function verifyGithubSignature(secret) {}", unitVector(7));
    await addChunk(projectB, "secret.ts", "verifyGithubSignature", "function verifyGithubSignature() {}", unitVector(0));
  });

  afterAll(async () => {
    await db.codeChunk.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
    await db.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
    await db.$disconnect();
  });

  it("keyword search finds an exact identifier", async () => {
    const rows = await searchChunksByKeyword(db, projectA, "where is verifyGithubSignature defined?", 5);
    expect(rows.map((row) => row.fileName)).toEqual(["auth.ts"]);
  });

  it("hybrid retrieval returns the keyword hit that the vector search ranks lower", async () => {
    const retrieve = createHybridChunkRetriever(db, fakeEmbeddings(unitVector(0)), projectA, { k: 5 });
    const files = (await retrieve("where is verifyGithubSignature defined?")).map((doc) => doc.metadata.source);
    expect(files).toContain("vec.ts");
    expect(files).toContain("auth.ts");
  });

  it("never returns another project's chunks", async () => {
    const retrieve = createHybridChunkRetriever(db, fakeEmbeddings(unitVector(0)), projectA, { k: 5 });
    const files = (await retrieve("verifyGithubSignature")).map((doc) => doc.metadata.source);
    expect(files).not.toContain("secret.ts");
  });

  it("survives a question with no usable keywords", async () => {
    const retrieve = createHybridChunkRetriever(db, fakeEmbeddings(unitVector(0)), projectA, { k: 5 });
    expect((await retrieve("how does it work?")).length).toBeGreaterThan(0);
  });
});
