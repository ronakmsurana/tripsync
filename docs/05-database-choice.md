# 5. Database choice and justification

> *"Database technology must be selected based on the problem requirements, and students must justify why SQL, NoSQL, or a vector database is appropriate for each type of data."*

| Data | Store | Why this store |
|---|---|---|
| Users, trips, membership, destinations, bookings, budgets, expenses, splits, payments, time slots | **PostgreSQL** | Highly relational and **transactional**: money must add up exactly, permissions depend on joins (`trip_members`), and rules span rows (an expense and its splits commit together or not at all; splits must sum to the amount; nothing scheduled outside the trip). Needs foreign keys, CHECKs, triggers, views, `NUMERIC(12,2)` and ACID. A document store would force the application to re-implement all of this. |
| Activity descriptions, tags, place, notes, per-type custom fields, estimated cost | **MongoDB** | **Semi-structured and variable**: a festival has performers and ticket tiers, a hike has difficulty and gear, a restaurant has cuisine and dietary options. Documents hold these without sparse columns or a join-heavy EAV model, new fields need no migration, and aggregation pipelines (`$group`, `$unwind`, `$facet`) summarise them naturally. A JSON-schema validator still protects the mandatory fields. |
| Semantic representation of each activity | **pgvector inside PostgreSQL** | Meaning-based retrieval needs nearest-neighbour search over 384-dimension vectors. Keeping the vector **in the same row-store** as the activity index means the same transaction creates/deletes it, queries can filter by `trip_id` and join to slots in one statement, and there is no extra service to run, secure or keep in sync. A separate vector service (Qdrant/Pinecone) would add operational cost with no benefit at this scale. |
| Keyword search | **PostgreSQL full-text** (`tsvector` + GIN) | Needed as an honest fallback when the model is unavailable, and often the better tool for exact words. Zero extra infrastructure. |

## Why not one database for everything?
* *Everything in PostgreSQL (JSONB for activities)* is viable, but then the NoSQL requirement would be technology-for-show. Here the activity documents are genuinely heterogeneous and evolve faster than the relational core.
* *Everything in MongoDB* would lose referential integrity, multi-row transactions with constraints, and the SQL views that produce budgets and balances from persisted rows.

## Consistency between the stores
PostgreSQL is the **source of truth**. MongoDB and the vector index are linked by `mongo_doc_id`. A single transaction cannot span PostgreSQL and MongoDB, so the design uses ordered writes, compensation and an idempotent repair job instead — see [10-architecture-security.md](10-architecture-security.md#cross-database-consistency).
