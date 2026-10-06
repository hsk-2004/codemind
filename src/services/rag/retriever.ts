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
