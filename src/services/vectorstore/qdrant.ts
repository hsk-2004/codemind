import { QdrantClient } from "@qdrant/js-client-rest";

export const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
export const CODE_CHUNKS_COLLECTION = "code_chunks";

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({ url: QDRANT_URL });
  }
  return client;
}

export interface CodeChunkPayload extends Record<string, unknown> {
  repositoryId: string;
  filePath: string;
  language: string;
  symbol: string | null;
  symbolType: string | null;
  startLine: number;
  endLine: number;
  content: string;
}

/** Creates the shared code-chunks collection if it does not already exist. Idempotent. */
export async function ensureCodeChunksCollection(vectorSize: number): Promise<void> {
  const qdrant = getQdrantClient();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === CODE_CHUNKS_COLLECTION);
  if (exists) return;

  await qdrant.createCollection(CODE_CHUNKS_COLLECTION, {
    vectors: { size: vectorSize, distance: "Cosine" },
  });
}

export async function upsertCodeChunks(
  points: { id: string; vector: number[]; payload: CodeChunkPayload }[]
): Promise<void> {
  if (points.length === 0) return;
  await getQdrantClient().upsert(CODE_CHUNKS_COLLECTION, {
    wait: true,
    points,
  });
}

/** Repository isolation is enforced here via a mandatory payload filter — never search without it. */
export async function searchCodeChunks(
  repositoryId: string,
  queryVector: number[],
  limit = 10
) {
  const result = await getQdrantClient().query(CODE_CHUNKS_COLLECTION, {
    query: queryVector,
    limit,
    filter: {
      must: [{ key: "repositoryId", match: { value: repositoryId } }],
    },
    with_payload: true,
  });
  return result.points;
}
