// ============================================
// Activity search index (PostgreSQL: pgvector + full-text)
// ============================================
// One row per activity in `activity_embeddings`.
//   content      text that was embedded (title, description, tags, type, place)
//   embedding    vector(384), cosine distance (<=>); NULL until generated
//   search_vector generated tsvector, GIN indexed, used for keyword search
// The row is written in the SAME transaction as the itinerary slot, so the
// index can never reference an activity that does not exist. The embedding is
// filled in afterwards; failures leave the row 'pending' and are retried by
// reindexPending() (idempotent).
// ============================================
import prisma from "@/lib/db/postgres";
import { Prisma } from "@prisma/client";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import { SearchHit } from "@/types";
import { embedText, embeddingStatus, toVectorLiteral, EmbeddingUnavailableError } from "./embeddingService";
import { formatLocalDateTime } from "@/lib/utils/time";

type Tx = Prisma.TransactionClient;

export function buildSearchContent(a: {
  title: string; description?: string; tags?: string[]; slotType: string; locationName?: string;
}): string {
  return [a.title, a.description, (a.tags ?? []).join(", "), a.slotType, a.locationName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(". ");
}

/** Insert or refresh the index row; any content change resets it to 'pending'. */
export async function upsertIndexRow(
  tx: Tx | typeof prisma,
  row: { mongoDocId: string; tripId: number; title: string; content: string }
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO activity_embeddings (mongo_doc_id, trip_id, title, content, sync_status)
    VALUES (${row.mongoDocId}, ${row.tripId}, ${row.title}, ${row.content}, 'pending')
    ON CONFLICT (mongo_doc_id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      embedding = CASE WHEN activity_embeddings.content = EXCLUDED.content THEN activity_embeddings.embedding ELSE NULL END,
      embedding_model = CASE WHEN activity_embeddings.content = EXCLUDED.content THEN activity_embeddings.embedding_model ELSE NULL END,
      sync_status = CASE WHEN activity_embeddings.content = EXCLUDED.content THEN activity_embeddings.sync_status ELSE 'pending' END`;
}

export async function deleteIndexRow(tx: Tx | typeof prisma, mongoDocId: string): Promise<void> {
  await tx.$executeRaw`DELETE FROM activity_embeddings WHERE mongo_doc_id = ${mongoDocId}`;
}

/**
 * Generates and stores the vector for one row. Returns false (and leaves the row
 * 'pending') when the model is unavailable. The WHERE content = ... guard makes a
 * stale embedding from a slow request impossible to overwrite newer text.
 */
export async function syncEmbedding(mongoDocId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ content: string }[]>`
    SELECT content FROM activity_embeddings WHERE mongo_doc_id = ${mongoDocId}`;
  if (rows.length === 0) return false;
  const content = rows[0].content;
  try {
    const vector = toVectorLiteral(await embedText(content));
    const model = embeddingStatus().model;
    const n = await prisma.$executeRaw`
      UPDATE activity_embeddings
         SET embedding = ${vector}::vector, embedding_model = ${model}, sync_status = 'synced'
       WHERE mongo_doc_id = ${mongoDocId} AND content = ${content}`;
    return n > 0;
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) return false;
    console.error("Embedding sync failed:", err);
    return false;
  }
}

export async function reindexPending(tripId?: number, limit = 200): Promise<{ attempted: number; synced: number; modelAvailable: boolean }> {
  const rows = tripId
    ? await prisma.$queryRaw<{ mongo_doc_id: string }[]>`
        SELECT mongo_doc_id FROM activity_embeddings WHERE sync_status = 'pending' AND trip_id = ${tripId} ORDER BY embedding_id LIMIT ${limit}`
    : await prisma.$queryRaw<{ mongo_doc_id: string }[]>`
        SELECT mongo_doc_id FROM activity_embeddings WHERE sync_status = 'pending' ORDER BY embedding_id LIMIT ${limit}`;
  let synced = 0;
  let modelAvailable = true;
  for (const r of rows) {
    const okSync = await syncEmbedding(r.mongo_doc_id);
    if (okSync) synced++;
    else if (embeddingStatus().lastError) { modelAvailable = false; break; }
  }
  return { attempted: rows.length, synced, modelAvailable };
}

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------
interface RawHit { mongo_doc_id: string; title: string; score: number; slot_type: string; start_time: Date; end_time: Date }

async function hydrate(raw: RawHit[], scoreLabel: (s: number) => string): Promise<SearchHit[]> {
  if (raw.length === 0) return [];
  const col = await getActivitiesCollection();
  const docs = await col.find({ _id: { $in: raw.map((r) => new ObjectId(r.mongo_doc_id)) } }).toArray();
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  return raw.map((r) => {
    const d = byId.get(r.mongo_doc_id);
    return {
      id: r.mongo_doc_id,
      title: r.title,
      score: Number(r.score),
      scoreLabel: scoreLabel(Number(r.score)),
      slotType: r.slot_type,
      description: d?.description ?? "",
      tags: d?.tags ?? [],
      startTime: formatLocalDateTime(r.start_time),
      endTime: formatLocalDateTime(r.end_time),
    };
  });
}

/** Vector similarity: cosine similarity = 1 - cosine distance, ordered by the HNSW-indexable <=> operator. */
export async function semanticSearch(tripId: number, query: string, limit: number) {
  const v = toVectorLiteral(await embedText(query)); // may throw EmbeddingUnavailableError
  const raw = await prisma.$queryRaw<RawHit[]>`
    SELECT e.mongo_doc_id, e.title, 1 - (e.embedding <=> ${v}::vector) AS score,
           s.slot_type, s.start_time, s.end_time
      FROM activity_embeddings e
      JOIN itinerary_slots s ON s.mongo_doc_id = e.mongo_doc_id
     WHERE e.trip_id = ${tripId} AND e.embedding IS NOT NULL
     ORDER BY e.embedding <=> ${v}::vector
     LIMIT ${limit}`;
  const pending = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM activity_embeddings WHERE trip_id = ${tripId} AND embedding IS NULL`;
  return {
    hits: await hydrate(raw, (s) => `${Math.round(Math.max(0, s) * 100)}% similar`),
    notIndexed: Number(pending[0]?.n ?? 0),
  };
}

/** Turns free text into a safe prefix-OR tsquery string: "temple sunrise" -> "temple:* | sunrise:*". */
export function toOrTsQuery(query: string): string | null {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 12);
  return words.length ? words.map((w) => `${w}:*`).join(" | ") : null;
}

/**
 * PostgreSQL full-text search (tsvector + GIN). Any query word may match (OR) and words match
 * as prefixes; results are ranked with ts_rank_cd (title weighted above body).
 */
export async function keywordSearch(tripId: number, query: string, limit: number) {
  const tsq = toOrTsQuery(query);
  if (!tsq) return { hits: [], notIndexed: 0 };
  const raw = await prisma.$queryRaw<RawHit[]>`
    SELECT e.mongo_doc_id, e.title,
           ts_rank_cd(e.search_vector, to_tsquery('english', ${tsq})) AS score,
           s.slot_type, s.start_time, s.end_time
      FROM activity_embeddings e
      JOIN itinerary_slots s ON s.mongo_doc_id = e.mongo_doc_id
     WHERE e.trip_id = ${tripId}
       AND e.search_vector @@ to_tsquery('english', ${tsq})
     ORDER BY score DESC, s.start_time
     LIMIT ${limit}`;
  return { hits: await hydrate(raw, (s) => `rank ${s.toFixed(2)}`), notIndexed: 0 };
}
