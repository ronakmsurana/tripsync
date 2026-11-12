// MongoDB demonstration: document shape, validator, indexes and aggregation pipelines.
//   node docs/mongo/aggregations.mjs      (needs a seeded database)
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const client = await MongoClient.connect(process.env.MONGODB_URI);
const col = client.db(process.env.MONGODB_DB || "tripsync").collection("activities");
const show = (title, v) => console.log(`\n=== ${title} ===\n${JSON.stringify(v, (k, x) => (x && x.$numberDecimal !== undefined ? x.$numberDecimal : x), 2)}`);

show("Sample document", await col.findOne({ title: /Matanga/ }, { projection: { notes: 0 } }));
show("Indexes", (await col.indexes()).map((i) => ({ name: i.name, key: i.key })));

show("Pipeline 1 — estimated cost and count per activity type ($match, $group, $sort, $project)", await col.aggregate([
  { $match: { tripId: 1 } },
  { $group: { _id: "$slotType", activities: { $sum: 1 }, estimatedCost: { $sum: "$estimatedCost.amount" }, avgMinutes: { $avg: "$estimatedDurationMinutes" } } },
  { $sort: { estimatedCost: -1 } },
  { $project: { _id: 0, type: "$_id", activities: 1, estimatedCost: 1, avgMinutes: { $round: ["$avgMinutes", 0] } } },
]).toArray());

show("Pipeline 2 — tag popularity ($unwind, $group, $sort, $limit)", await col.aggregate([
  { $match: { tripId: 1 } }, { $unwind: "$tags" },
  { $group: { _id: "$tags", count: { $sum: 1 }, titles: { $push: "$title" } } },
  { $sort: { count: -1, _id: 1 } }, { $limit: 5 },
]).toArray());

show("Pipeline 3 — $facet: several summaries in ONE pass (what GET /api/trips/:id/insights runs)", await col.aggregate([
  { $match: { tripId: 1 } },
  { $facet: {
      byType: [{ $group: { _id: "$slotType", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
      topTags: [{ $unwind: "$tags" }, { $group: { _id: "$tags", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 3 }],
      totals: [{ $group: { _id: null, activities: { $sum: 1 }, minutes: { $sum: "$estimatedDurationMinutes" }, estimated: { $sum: "$estimatedCost.amount" } } }],
  } },
]).toArray());

console.log("\n=== Validator: invalid documents are rejected BY MONGODB ===");
const now = new Date();
for (const [label, doc] of [
  ["unknown slotType", { tripId: 1, slotType: "rave", title: "x", createdBy: 1, createdAt: now, updatedAt: now }],
  ["empty title", { tripId: 1, slotType: "custom", title: "", createdBy: 1, createdAt: now, updatedAt: now }],
  ["missing createdBy", { tripId: 1, slotType: "custom", title: "x", createdAt: now, updatedAt: now }],
  ["too many tags", { tripId: 1, slotType: "custom", title: "x", tags: Array(21).fill("a"), createdBy: 1, createdAt: now, updatedAt: now }],
]) {
  try { await col.insertOne({ _id: new ObjectId(), ...doc }); console.log(`✗ ${label}: ACCEPTED (unexpected)`); }
  catch (e) { console.log(`✓ ${label}: rejected — ${e.codeName ?? e.message} (code ${e.code})`); }
}
await client.close();
