// ============================================
// Cross-database reconciliation (idempotent)
// ============================================
// PostgreSQL is the source of truth. reconcile() repairs the three stores:
//   1. slot without Mongo document  -> create a minimal document (repair)
//   2. Mongo document without slot  -> delete it (orphan)
//   3. slot without index row       -> create a 'pending' index row
//   4. index row without slot       -> delete it
//   5. pending embeddings           -> generate (if the model is available)
// Safe to run any number of times.
// ============================================
import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { Decimal128, ObjectId } from "mongodb";
import { buildSearchContent, reindexPending, upsertIndexRow } from "./searchIndexService";
import { MINUTE_MS } from "@/lib/utils/time";

export async function reconcile() {
  const col = await getActivitiesCollection();
  const slots = await prisma.itinerarySlot.findMany({ include: { trip: { select: { currency: true } } } });
  const docs = await col.find({}, { projection: { _id: 1 } }).toArray();
  const docIds = new Set(docs.map((d) => d._id.toString()));
  const slotIds = new Set(slots.map((s) => s.mongoDocId));

  let recreatedDocuments = 0;
  for (const s of slots) {
    if (docIds.has(s.mongoDocId)) continue;
    const now = new Date();
    await col.insertOne({
      _id: new ObjectId(s.mongoDocId), tripId: s.tripId, slotType: s.slotType, title: s.title, description: "", tags: [], location: {},
      estimatedDurationMinutes: Math.round((s.endTime.getTime() - s.startTime.getTime()) / MINUTE_MS),
      estimatedCost: { amount: Decimal128.fromString("0.00"), currency: s.trip.currency },
      notes: [], customFields: {}, createdBy: s.createdBy, createdAt: now, updatedAt: now,
    });
    recreatedDocuments++;
  }

  const orphanDocIds = [...docIds].filter((id) => !slotIds.has(id));
  let deletedOrphanDocuments = 0;
  if (orphanDocIds.length) {
    const r = await col.deleteMany({ _id: { $in: orphanDocIds.map((i) => new ObjectId(i)) } });
    deletedOrphanDocuments = r.deletedCount;
  }

  const idx = await prisma.$queryRaw<{ mongo_doc_id: string }[]>`SELECT mongo_doc_id FROM activity_embeddings`;
  const idxIds = new Set(idx.map((r) => r.mongo_doc_id));
  let createdIndexRows = 0;
  for (const s of slots) {
    if (idxIds.has(s.mongoDocId)) continue;
    const doc = await col.findOne({ _id: new ObjectId(s.mongoDocId) });
    await upsertIndexRow(prisma, {
      mongoDocId: s.mongoDocId, tripId: s.tripId, title: s.title,
      content: buildSearchContent({ title: s.title, description: doc?.description, tags: doc?.tags, slotType: s.slotType, locationName: doc?.location?.name }),
    });
    createdIndexRows++;
  }
  const deletedOrphanIndexRows = Number(
    await prisma.$executeRaw`DELETE FROM activity_embeddings e WHERE NOT EXISTS (SELECT 1 FROM itinerary_slots s WHERE s.mongo_doc_id = e.mongo_doc_id)`
  );

  const embeddings = await reindexPending();
  return { recreatedDocuments, deletedOrphanDocuments, createdIndexRows, deletedOrphanIndexRows, embeddings };
}

export async function systemOverview() {
  const col = await getActivitiesCollection();
  const [users, trips, slots, mongoDocs, pending, synced] = await Promise.all([
    prisma.user.count(),
    prisma.trip.count(),
    prisma.itinerarySlot.count(),
    col.countDocuments(),
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM activity_embeddings WHERE sync_status = 'pending'`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM activity_embeddings WHERE sync_status = 'synced'`,
  ]);
  // Users with their trip counts: JOIN + GROUP BY + HAVING-free aggregate, ordered.
  const people = await prisma.$queryRaw<{ user_id: number; name: string; email: string; role: string; status: string; trips: bigint; created_at: Date }[]>`
    SELECT u.user_id, u.name, u.email, u.role, u.status, COUNT(tm.trip_id) AS trips, u.created_at
      FROM users u LEFT JOIN trip_members tm ON tm.user_id = u.user_id AND tm.status = 'active'
     GROUP BY u.user_id ORDER BY u.created_at DESC LIMIT 200`;
  return {
    counts: { users, trips, slots, mongoDocuments: mongoDocs, embeddingsSynced: Number(synced[0].n), embeddingsPending: Number(pending[0].n) },
    drift: { slotsWithoutDocument: Math.max(0, slots - mongoDocs), documentsWithoutSlot: Math.max(0, mongoDocs - slots) },
    users: people.map((p) => ({ userId: p.user_id, name: p.name, email: p.email, role: p.role, status: p.status, trips: Number(p.trips), createdAt: p.created_at.toISOString() })),
  };
}
