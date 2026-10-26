// ============================================
// Embedding Service (pgvector + Transformers)
// ============================================
// Generates text embeddings using a local
// sentence-transformer model and stores them
// in PostgreSQL via pgvector for semantic search.
// ============================================

import prisma from "@/lib/db/postgres";
import { SearchResult } from "@/types";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

// Dynamic import for the transformers pipeline (heavy module)
let pipelineInstance: ReturnType<typeof createPipelineSingleton> | null = null;

function createPipelineSingleton() {
  let instance: unknown = null;

  return async () => {
    if (!instance) {
      const { pipeline } = await import("@xenova/transformers");
      instance = await pipeline(
        "feature-extraction",
        process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2"
      );
    }
    return instance;
  };
}

function getPipeline() {
  if (!pipelineInstance) {
    pipelineInstance = createPipelineSingleton();
  }
  return pipelineInstance();
}

/**
 * Generate an embedding vector for the given text.
 * Returns a 384-dimensional float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  // @ts-expect-error - Pipeline callable
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data as Float32Array);
}

/**
 * Store an activity embedding in PostgreSQL.
 * Creates or updates the embedding for the given MongoDB document.
 */
export async function storeEmbedding(
  mongoDocId: string,
  tripId: number,
  title: string,
  text: string
): Promise<void> {
  const embedding = await generateEmbedding(text);
  const vectorStr = `[${embedding.join(",")}]`;

  // Upsert: insert or update on conflict
  await prisma.$executeRaw`
    INSERT INTO activity_embeddings (mongo_doc_id, trip_id, title, embedding)
    VALUES (${mongoDocId}, ${tripId}, ${title}, ${vectorStr}::vector)
    ON CONFLICT (mongo_doc_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      embedding = EXCLUDED.embedding,
      created_at = CURRENT_TIMESTAMP
  `;
}

/**
 * Delete an embedding when an activity is removed.
 */
export async function deleteEmbedding(mongoDocId: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM activity_embeddings WHERE mongo_doc_id = ${mongoDocId}
  `;
}

/**
 * Perform semantic similarity search.
 * Returns activities most similar to the query text.
 */
export async function semanticSearch(
  query: string,
  tripId?: number,
  limit: number = 5
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Query pgvector with cosine similarity
  let results: Array<{
    mongo_doc_id: string;
    title: string;
    similarity: number;
  }>;

  if (tripId) {
    results = await prisma.$queryRaw`
      SELECT
        mongo_doc_id,
        title,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM activity_embeddings
      WHERE trip_id = ${tripId}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT
        mongo_doc_id,
        title,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM activity_embeddings
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  }

  // Enrich with MongoDB activity data
  const activitiesCol = await getActivitiesCollection();
  const enrichedResults: SearchResult[] = [];

  for (const row of results) {
    const activity = await activitiesCol.findOne({
      _id: new ObjectId(row.mongo_doc_id),
    });

    enrichedResults.push({
      mongoDocId: row.mongo_doc_id,
      title: row.title,
      similarity: Number(row.similarity),
      activity: activity
        ? {
            ...activity,
            _id: activity._id.toString(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any
        : undefined,
    });
  }

  return enrichedResults;
}
