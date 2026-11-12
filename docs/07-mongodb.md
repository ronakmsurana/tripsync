# 7. MongoDB (NoSQL) design

## Purpose
MongoDB stores the **rich, schema-flexible description** of each itinerary activity. The time skeleton (trip, start, end, type, title) and everything
relational stay in PostgreSQL; the two are joined by the activity's ObjectId, stored as `itinerary_slots.mongo_doc_id`.
Why MongoDB here: [05-database-choice.md](05-database-choice.md).

## Collection `activities`
```jsonc
{
  "_id": ObjectId,                    // = itinerary_slots.mongo_doc_id
  "tripId": 1,                        // int  – ownership; every query filters on it
  "slotType": "sightseeing",          // enum: sightseeing | dining | adventure | leisure | festival | custom
  "title": "Sunrise at Matanga Hill", // 1–200 chars (denormalised copy of the slot title)
  "description": "Climb Matanga Hill …",
  "location": { "name": "Matanga Hill, Hampi", "coordinates": { "lat": 15.33, "lng": 76.46 } },
  "tags": ["sunrise", "hiking"],      // ≤ 20 lowercase strings, each ≤ 40 chars
  "estimatedDurationMinutes": 120,
  "estimatedCost": { "amount": NumberDecimal("0.00"), "currency": "INR" },  // Decimal128: exact money
  "notes": [ { "userId": 2, "text": "Bring water", "createdAt": ISODate } ],
  "customFields": { "difficulty": "moderate" },   // free-form, ≤ 10 KB, differs per activity type
  "createdBy": 2, "createdAt": ISODate, "updatedAt": ISODate
}
```
Real sample document: [`mongo/aggregations.output.txt`](mongo/aggregations.output.txt).

## Validation (the NoSQL "constraints")
`src/lib/db/mongodb.ts` creates the collection with a `$jsonSchema` validator (`validationLevel: strict`, `validationAction: error`):
required fields, enum for `slotType`, string length limits, `tags` ≤ 20, `estimatedCost` shape (Decimal128 allowed), note shape.
`npm run db:mongo` (and the app on first use) applies it idempotently with `createCollection` or `collMod`.
**Demonstrated:** four invalid documents (unknown type, empty title, missing `createdBy`, 21 tags) are each rejected by MongoDB with error 121 — see the end of the output file.

## Indexes
| Index | Serves |
|---|---|
| `{ tripId: 1, slotType: 1 }` | per-trip aggregations by type |
| `{ tags: 1 }` (multikey) | tag lookups / `$unwind` + `$group` |
| `{ tripId: 1, createdAt: -1 }` | recent activities of a trip |

## Operations used by the application
* `insertOne` (create), `updateOne` with `$set`/`$push` (edit, add note), `deleteOne` / `deleteMany({tripId})` (delete activity / trip), `find({_id: {$in: …}})` (batch hydration of lists and search results — one query, never N+1).
* **Aggregation pipelines** — `src/lib/services/budgetService.ts` and `insightsService.ts`:
  1. cost and count per activity type (`$match → $group → $sort → $project`),
  2. tag popularity (`$unwind → $group → $sort → $limit`),
  3. **`$facet`** producing by-type, top-tags and totals in a single pass (`GET /api/trips/:id/insights`).
  Runnable demo with real output: `npm run docs:mongo` → [`mongo/aggregations.output.txt`](mongo/aggregations.output.txt).
* Money inside MongoDB is **Decimal128**, so `$sum` is exact (`150.00 + 0.10 …` never produces float noise).

## Failure handling
* MongoDB down on **create** → the PostgreSQL rows are compensated (deleted) and the API returns **503** with a clear message — nothing half-saved.
* MongoDB down on **update** → PostgreSQL is already updated; the API returns 503 and the same request can be retried safely (idempotent `$set`).
* MongoDB down on **delete** → the PostgreSQL delete succeeds; an orphan document is invisible (lists are driven by PostgreSQL) and removed by `reconcile()`.
* A document missing for an existing slot → the UI shows a "details missing" badge and `reconcile()` recreates a minimal document.
* Seeding is idempotent (`npm run db:seed` skips an existing demo trip; `-- --reset` recreates it).
