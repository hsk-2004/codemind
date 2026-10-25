import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { PrismaClient } from "@prisma/client";
import type { Retrieve, SourceDocument, SourceMetadata } from "./chain";
import { keywordTerms, reciprocalRankFusion, toTsQuery } from "./fusion";

export interface RetrieverOptions {
  k?: number;
  minScore?: number;
}

interface Row {
  fileName: string;
  sourceCode: string;
  summary: string;
  similarity: number;
}

/**
 * Cosine-similarity retriever over pgvector. Every query is filtered by
 * projectId, so one repository can never retrieve another repository's code.
 */
export function createPgVectorRetriever(
  db: PrismaClient,
  embeddings: EmbeddingsInterface,
  projectId: string,
  { k = 5, minScore = 0.3 }: RetrieverOptions = {},
): Retrieve {
  return async (question: string): Promise<SourceDocument[]> => {
    const vector = await embeddings.embedQuery(question);
    if (vector.length === 0) return [];
    const vectorLiteral = `[${vector.join(",")}]`;

    const rows = await db.$queryRaw<Row[]>`
      SELECT "fileName", "sourceCode", "summary",
             1 - ("summaryEmbedding" <=> ${vectorLiteral}::vector) AS similarity
      FROM "SourceCodeEmbedding"
      WHERE "projectId" = ${projectId}
        AND "summaryEmbedding" IS NOT NULL
        AND 1 - ("summaryEmbedding" <=> ${vectorLiteral}::vector) > ${minScore}
      ORDER BY similarity DESC
      LIMIT ${k}
    `;

    return rows.map(
      (row) =>
        new Document<SourceMetadata>({
          pageContent: row.sourceCode,
          metadata: { source: row.fileName, summary: row.summary, score: Number(row.similarity) },
        }),
    );
  };
}

export interface ChunkRow {
  fileName: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  similarity: number;
}

const lines = (c: Pick<ChunkRow, "startLine" | "endLine">) => `lines ${c.startLine}–${c.endLine}`;

/**
 * Groups matching chunks by file, so each source is one file holding only its
 * relevant functions in source order, each marked with its line range.
 */
export function groupChunksByFile(rows: ChunkRow[]): SourceDocument[] {
  const byFile = new Map<string, ChunkRow[]>();
  for (const row of rows) byFile.set(row.fileName, [...(byFile.get(row.fileName) ?? []), row]);

  return [...byFile.entries()]
    .map(([fileName, chunks]) => {
      const ordered = [...chunks].sort((a, b) => a.startLine - b.startLine);
      const matched = ordered.map((c) => (c.symbol ? `${c.symbol} (${lines(c)})` : lines(c))).join(", ");
      return new Document<SourceMetadata>({
        pageContent: ordered.map((c) => `··· ${lines(c)}${c.symbol ? ` · ${c.symbol}` : ""} ···\n${c.content}`).join("\n\n"),
        metadata: {
          source: fileName,
          summary: `Function-level match: ${matched}`,
          score: Math.max(...chunks.map((c) => Number(c.similarity))),
        },
      });
    })
    .sort((a, b) => b.metadata.score - a.metadata.score);
}

/**
 * Function-level retriever: searches the code chunks of every indexed file,
 * not only the summarised ones, and returns the matching functions grouped by
 * file. Like the file retriever, it is always filtered by projectId.
 */
export function createChunkRetriever(
  db: PrismaClient,
  embeddings: EmbeddingsInterface,
  projectId: string,
  { k = 8, minScore = 0.3 }: RetrieverOptions = {},
): Retrieve {
  return async (question: string): Promise<SourceDocument[]> => {
    const vector = await embeddings.embedQuery(question);
    if (vector.length === 0) return [];
    const vectorLiteral = `[${vector.join(",")}]`;

    const rows = await db.$queryRaw<ChunkRow[]>`
      SELECT "fileName", "symbol", "startLine", "endLine", "content",
             1 - ("embedding" <=> ${vectorLiteral}::vector) AS similarity
      FROM "CodeChunk"
      WHERE "projectId" = ${projectId}
        AND "embedding" IS NOT NULL
        AND 1 - ("embedding" <=> ${vectorLiteral}::vector) > ${minScore}
      ORDER BY similarity DESC
      LIMIT ${k}
    `;
    return groupChunksByFile(rows);
  };
}

export type RetrievalMode = "vector" | "hybrid";

const chunkKey = (row: Pick<ChunkRow, "fileName" | "startLine" | "endLine">) => `${row.fileName}:${row.startLine}-${row.endLine}`;

/**
 * Keyword search over the same chunks, using PostgreSQL full-text search. It
 * finds exact identifiers (function and variable names) that an embedding can
 * blur. Filtered by projectId like every other retriever.
 */
export async function searchChunksByKeyword(db: PrismaClient, projectId: string, question: string, limit: number): Promise<ChunkRow[]> {
  const terms = keywordTerms(question);
  if (terms.length === 0) return [];
  const tsQuery = toTsQuery(terms);
  return db.$queryRaw<ChunkRow[]>`
    SELECT "fileName", "symbol", "startLine", "endLine", "content",
           ts_rank(to_tsvector('simple', "content" || ' ' || coalesce("symbol", '')), to_tsquery('simple', ${tsQuery})) AS similarity
    FROM "CodeChunk"
    WHERE "projectId" = ${projectId}
      AND to_tsvector('simple', "content" || ' ' || coalesce("symbol", '')) @@ to_tsquery('simple', ${tsQuery})
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}

/**
 * Hybrid retriever: runs the vector search and the keyword search, then merges
 * the two ranked lists with Reciprocal Rank Fusion. A chunk that both searches
 * agree on ranks first, and a chunk only one search found is still kept.
 */
export function createHybridChunkRetriever(
  db: PrismaClient,
  embeddings: EmbeddingsInterface,
  projectId: string,
  { k = 8, minScore = 0.3 }: RetrieverOptions = {},
): Retrieve {
  return async (question: string): Promise<SourceDocument[]> => {
    const vector = await embeddings.embedQuery(question);
    const candidates = k * 3;
    const vectorLiteral = `[${vector.join(",")}]`;

    const [semantic, keyword] = await Promise.all([
      vector.length === 0
        ? Promise.resolve([] as ChunkRow[])
        : db.$queryRaw<ChunkRow[]>`
            SELECT "fileName", "symbol", "startLine", "endLine", "content",
                   1 - ("embedding" <=> ${vectorLiteral}::vector) AS similarity
            FROM "CodeChunk"
            WHERE "projectId" = ${projectId}
              AND "embedding" IS NOT NULL
              AND 1 - ("embedding" <=> ${vectorLiteral}::vector) > ${minScore}
            ORDER BY similarity DESC
            LIMIT ${candidates}
          `,
      searchChunksByKeyword(db, projectId, question, candidates),
    ]);

    // Keyword ranks are not similarities, so keyword-only hits are shown at the minimum score.
    const keywordOnly = keyword.map((row) => ({ ...row, similarity: minScore }));
    const fused = reciprocalRankFusion([semantic, keywordOnly], chunkKey).slice(0, k);
    return groupChunksByFile(fused.map(({ item }) => item));
  };
}

/**
 * Uses the function-level index when the project has one, and the file index
 * otherwise. `mode: "hybrid"` adds keyword search to the function-level index.
 */
export async function createProjectRetriever(
  db: PrismaClient,
  embeddings: EmbeddingsInterface,
  projectId: string,
  chunkCount: number,
  mode: RetrievalMode = process.env.RETRIEVAL_MODE === "hybrid" ? "hybrid" : "vector",
): Promise<{ retrieve: Retrieve; level: "function" | "file"; mode: RetrievalMode }> {
  const hasChunks = (await db.codeChunk.count({ where: { projectId } })) > 0;
  if (!hasChunks) return { retrieve: createPgVectorRetriever(db, embeddings, projectId), level: "file", mode: "vector" };
  const make = mode === "hybrid" ? createHybridChunkRetriever : createChunkRetriever;
  return { retrieve: make(db, embeddings, projectId, { k: chunkCount }), level: "function", mode };
}
