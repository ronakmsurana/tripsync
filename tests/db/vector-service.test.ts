// Exercises the REAL search-index service code (Prisma raw SQL, pgvector casts, Mongo hydration,
// pending/synced lifecycle) against real PostgreSQL + MongoDB.
// ONLY the text->vector function is replaced by a deterministic "concept" stub, so this verifies the
// storage / ranking / synchronisation logic, NOT the quality of the MiniLM model
// (run `npm run verify:embeddings` for that).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { testDbUrl } from "./globalSetup";

process.env.DATABASE_URL = testDbUrl();
process.env.MONGODB_DB = "tripsync_test";

let available = true;
const CONCEPTS: [RegExp, number][] = [[/sunrise|dawn|morning/i, 0], [/temple|shrine|worship/i, 1], [/food|lunch|dinner|meal/i, 2], [/river|boat|water/i, 3]];
function concept(text: string): number[] {
  const v = new Array(384).fill(0);
  let hit = false;
  for (const [re, i] of CONCEPTS) if (re.test(text)) { v[i] = 1; hit = true; }
  if (!hit) v[100] = 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

vi.mock("@/lib/services/embeddingService", async (orig) => {
  const real = await orig<typeof import("@/lib/services/embeddingService")>();
  return {
    ...real,
    embedText: async (t: string) => {
      if (!available) throw new real.EmbeddingUnavailableError("model offline (test)");
      return concept(t);
    },
    embeddingStatus: () => ({ enabled: true, model: "test-concept-stub" }),
  };
});

const { default: prisma } = await import("@/lib/db/postgres");
const { getActivitiesCollection, closeMongo } = await import("@/lib/db/mongodb");
const idx = await import("@/lib/services/searchIndexService");

let tripId: number;
const ids: Record<string, string> = {};

async function addActivity(key: string, title: string, description: string, tags: string[], start: string) {
  const mongoDocId = new ObjectId().toHexString();
  ids[key] = mongoDocId;
  const now = new Date();
  await prisma.itinerarySlot.create({
    data: { tripId, mongoDocId, slotType: "sightseeing", title, startTime: new Date(`${start}:00Z`), endTime: new Date(new Date(`${start}:00Z`).getTime() + 3600_000), createdBy: userId },
  });
  const col = await getActivitiesCollection();
  const { Decimal128 } = await import("mongodb");
  await col.insertOne({ _id: new ObjectId(mongoDocId), tripId, slotType: "sightseeing", title, description, tags, createdBy: userId, createdAt: now, updatedAt: now,
    estimatedCost: { amount: Decimal128.fromString("0.00"), currency: "INR" } });
  await idx.upsertIndexRow(prisma, { mongoDocId, tripId, title, content: idx.buildSearchContent({ title, description, tags, slotType: "sightseeing" }) });
}
let userId: number;

beforeAll(async () => {
  const u = await prisma.user.create({ data: { name: "V", email: `v${Date.now()}@t.local`, passwordHash: "$2b$12$" + "a".repeat(53) } });
  userId = u.userId;
  const t = await prisma.trip.create({ data: { tripName: "Vec", startDate: new Date("2026-12-20T00:00:00Z"), endDate: new Date("2026-12-24T00:00:00Z"), createdBy: userId } });
  tripId = t.tripId;
  await prisma.tripMember.create({ data: { tripId, userId, memberRole: "organizer" } });
  await addActivity("sunrise", "Hilltop viewpoint", "Climb for the dawn light over the valley", ["hiking"], "2026-12-21T06:00");
  await addActivity("temple", "Old shrine visit", "A quiet worship hall with carved pillars", ["heritage"], "2026-12-21T10:00");
  await addActivity("lunch", "Riverside restaurant", "Thali lunch with a view", ["food"], "2026-12-21T13:00");
});

afterAll(async () => {
  const col = await getActivitiesCollection();
  await col.deleteMany({ tripId });
  await prisma.trip.delete({ where: { tripId } });
  await closeMongo();
});

describe("search index lifecycle (pending -> synced)", () => {
  it("new rows are 'pending' with no vector, and keyword search already works", async () => {
    const rows = await prisma.$queryRaw<{ sync_status: string; has_vec: boolean }[]>`SELECT sync_status, embedding IS NOT NULL AS has_vec FROM activity_embeddings WHERE trip_id=${tripId}`;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.sync_status === "pending" && !r.has_vec)).toBe(true);
    const kw = await idx.keywordSearch(tripId, "shrine pillars", 5);
    expect(kw.hits.map((h) => h.title)).toEqual(["Old shrine visit"]);
    expect(kw.hits[0].description).toContain("worship hall"); // hydrated from MongoDB
  });

  it("falls back cleanly when the model is unavailable: rows stay pending, nothing is faked", async () => {
    available = false;
    expect(await idx.syncEmbedding(ids.sunrise)).toBe(false);
    await expect(idx.semanticSearch(tripId, "dawn", 3)).rejects.toThrow(/offline/);
    const r = await prisma.$queryRaw<{ sync_status: string }[]>`SELECT sync_status FROM activity_embeddings WHERE mongo_doc_id=${ids.sunrise}`;
    expect(r[0].sync_status).toBe("pending");
    available = true;
  });

  it("reindexPending() embeds every pending row and marks it synced with the model name", async () => {
    const r = await idx.reindexPending(tripId);
    expect(r).toMatchObject({ attempted: 3, synced: 3, modelAvailable: true });
    const rows = await prisma.$queryRaw<{ sync_status: string; embedding_model: string }[]>`SELECT sync_status, embedding_model FROM activity_embeddings WHERE trip_id=${tripId}`;
    expect(rows.every((x) => x.sync_status === "synced" && x.embedding_model === "test-concept-stub")).toBe(true);
    expect((await idx.reindexPending(tripId)).attempted).toBe(0); // idempotent
  });
});

describe("semantic search (cosine similarity over pgvector)", () => {
  it("ranks the semantically closest activity first and reports a similarity score", async () => {
    const dawn = await idx.semanticSearch(tripId, "an early morning walk", 3);
    expect(dawn.hits[0].title).toBe("Hilltop viewpoint");
    expect(dawn.hits[0].score).toBeGreaterThan(0.99);
    expect(dawn.hits[0].scoreLabel).toMatch(/100% similar/);
    expect(dawn.hits[1].score).toBeLessThan(0.01);
    const food = await idx.semanticSearch(tripId, "dinner place", 1);
    expect(food.hits.map((h) => h.title)).toEqual(["Riverside restaurant"]);
  });

  it("never returns activities of another trip", async () => {
    const t2 = await prisma.trip.create({ data: { tripName: "Other", startDate: new Date("2026-12-20T00:00:00Z"), endDate: new Date("2026-12-24T00:00:00Z"), createdBy: userId } });
    const id = new ObjectId().toHexString();
    await prisma.itinerarySlot.create({ data: { tripId: t2.tripId, mongoDocId: id, slotType: "custom", title: "Dawn elsewhere", startTime: new Date("2026-12-21T06:00:00Z"), endTime: new Date("2026-12-21T07:00:00Z"), createdBy: userId } });
    await idx.upsertIndexRow(prisma, { mongoDocId: id, tripId: t2.tripId, title: "Dawn elsewhere", content: "dawn" });
    await idx.syncEmbedding(id);
    const res = await idx.semanticSearch(tripId, "dawn", 10);
    expect(res.hits.map((h) => h.id)).not.toContain(id);
    await prisma.trip.delete({ where: { tripId: t2.tripId } });
  });

  it("editing the text invalidates the stale vector until it is re-embedded", async () => {
    await idx.upsertIndexRow(prisma, { mongoDocId: ids.temple, tripId, title: "Old shrine visit", content: "Now a sunrise yoga session" });
    const st = await prisma.$queryRaw<{ sync_status: string; has_vec: boolean }[]>`SELECT sync_status, embedding IS NOT NULL AS has_vec FROM activity_embeddings WHERE mongo_doc_id=${ids.temple}`;
    expect(st[0]).toEqual({ sync_status: "pending", has_vec: false });
    const before = await idx.semanticSearch(tripId, "worship", 5);
    expect(before.notIndexed).toBe(1);
    expect(before.hits.map((h) => h.id)).not.toContain(ids.temple); // not searchable semantically until re-embedded
    await idx.syncEmbedding(ids.temple);
    const after = await idx.semanticSearch(tripId, "dawn", 3);
    expect(after.hits.slice(0, 2).map((h) => h.id).sort()).toEqual([ids.sunrise, ids.temple].sort());
  });

  it("an unchanged re-upsert keeps the existing vector (no needless re-embedding)", async () => {
    const row = await prisma.$queryRaw<{ content: string }[]>`SELECT content FROM activity_embeddings WHERE mongo_doc_id=${ids.lunch}`;
    await idx.upsertIndexRow(prisma, { mongoDocId: ids.lunch, tripId, title: "Riverside restaurant", content: row[0].content });
    const st = await prisma.$queryRaw<{ sync_status: string }[]>`SELECT sync_status FROM activity_embeddings WHERE mongo_doc_id=${ids.lunch}`;
    expect(st[0].sync_status).toBe("synced");
  });

  it("deleting the index row removes the activity from both search modes", async () => {
    await idx.deleteIndexRow(prisma, ids.lunch);
    expect((await idx.semanticSearch(tripId, "lunch", 10)).hits.map((h) => h.id)).not.toContain(ids.lunch);
    expect((await idx.keywordSearch(tripId, "restaurant", 10)).hits).toHaveLength(0);
  });
});
