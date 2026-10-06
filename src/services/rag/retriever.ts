import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { PrismaClient } from "@prisma/client";
import type { Retrieve, SourceDocument, SourceMetadata } from "./chain";

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

/** Uses the function-level index when the project has one, and the file index otherwise. */
export async function createProjectRetriever(
  db: PrismaClient,
  embeddings: EmbeddingsInterface,
  projectId: string,
  chunkCount: number,
): Promise<{ retrieve: Retrieve; level: "function" | "file" }> {
  const hasChunks = (await db.codeChunk.count({ where: { projectId } })) > 0;
  return hasChunks
    ? { retrieve: createChunkRetriever(db, embeddings, projectId, { k: chunkCount }), level: "function" }
    : { retrieve: createPgVectorRetriever(db, embeddings, projectId), level: "file" };
}
