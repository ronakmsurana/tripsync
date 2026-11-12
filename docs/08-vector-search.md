# 8. Vector database / semantic search

| Question in the requirements | Answer |
|---|---|
| **What data is converted into embeddings?** | One text per activity: `title. description. tags, slotType. place name` (built by `buildSearchContent()` in `src/lib/services/searchIndexService.ts`), stored next to the vector in `activity_embeddings.content`. |
| **Which embedding model?** | `Xenova/all-MiniLM-L6-v2` (sentence-transformers MiniLM, 384 dimensions, ONNX quantised) executed **locally** in Node through `@xenova/transformers`. No API key, no per-query cost, no data leaves the server. Configurable with `EMBEDDING_MODEL`; can be switched off with `EMBEDDING_ENABLED=false`. Output is mean-pooled and L2-normalised. |
| **How are vectors stored?** | PostgreSQL **pgvector**: column `activity_embeddings.embedding vector(384)` (the type itself rejects any other dimension). Metadata beside it: `mongo_doc_id` (stable id of the activity), `trip_id`, `title`, `content`, `embedding_model`, `sync_status` (`pending`/`synced`). A CHECK constraint forbids `synced` without a vector. |
| **Similarity metric?** | **Cosine** similarity, computed as `1 − (embedding <=> query)` where `<=>` is pgvector's cosine-distance operator. |
| **Index?** | `HNSW (embedding vector_cosine_ops)` for approximate nearest-neighbour search. (With a handful of rows per trip PostgreSQL's planner correctly prefers an exact scan; the index matters at scale.) |
| **How are results retrieved?** | `POST /api/trips/:id/search` embeds the query, then `SELECT … FROM activity_embeddings e JOIN itinerary_slots s … WHERE e.trip_id = $trip AND e.embedding IS NOT NULL ORDER BY e.embedding <=> $query LIMIT n`. The ids are then hydrated with **one** MongoDB `$in` query. Always scoped to the caller's trip (membership checked first). |

## Lifecycle and synchronisation
```
create/update activity ─┐ same PostgreSQL transaction
   itinerary_slots row  │
   activity_embeddings row (content set, embedding NULL, sync_status 'pending') ─┘
        │
        ▼  right after the MongoDB write
   embed(content) ──ok──▶ UPDATE … SET embedding, embedding_model, sync_status='synced'
                      │      (guarded by  WHERE content = <text that was embedded>  → a slow request can never
                      │       store a stale vector over newer text)
                      └─fail─▶ stays 'pending'  → retried by reindexPending() / `npm run db:reindex` / admin "Run reconcile"
update with changed text ──▶ vector set to NULL, status 'pending' (unchanged text keeps its vector)
delete activity / delete trip ──▶ row deleted in the same transaction / by ON DELETE CASCADE
```
Everything above is covered by `tests/db/vector-service.test.ts` (8 tests).

## Honest fallback (no faked results)
If the model cannot be loaded (offline, blocked network, `EMBEDDING_ENABLED=false`, timeout) the provider throws `EmbeddingUnavailableError` and:
* **Auto mode** switches to PostgreSQL full-text search and the API/UI say so: badge *"Keyword · full-text"* plus the notice *"Semantic search is currently unavailable, so these are keyword (full-text) results."*
* **Semantic-only mode** returns HTTP **503** `EMBEDDINGS_UNAVAILABLE` instead of pretending.
* Rows that have no vector yet are reported ("N activities are not indexed for semantic search yet").
The failure is cached for 60 s so an unreachable model does not slow every request.

## Keyword search (the other half of the same table)
`search_vector` is a **generated** `tsvector` (`title` weight A, `content` weight B) with a **GIN** index. Free text is converted to a safe prefix-OR query (`"temple sunrise"` → `temple:* | sunrise:*`) and ranked with `ts_rank_cd`.

## What was and was not verified (read this)
| Part | Verified how |
|---|---|
| pgvector storage, dimension check, cosine ordering, `trip_id` scoping, HNSW/GIN index existence | `tests/db/advanced.test.ts` with synthetic unit vectors (e.g. cosine of 45° = 0.7071) |
| The application's own code (`syncEmbedding`, `semanticSearch`, `reindexPending`, stale-vector guard, hydration from MongoDB, fallback) | `tests/db/vector-service.test.ts` — real PostgreSQL + MongoDB, **text→vector function replaced by a deterministic concept stub** |
| Fallback behaviour through HTTP and the browser | `tests/api` and `tests/e2e` (the embedding model could not be downloaded in the build environment, so these runs exercised the fallback path for real) |
| **The real MiniLM model and the quality of its rankings** | **Not verifiable where this was built** (no access to the Hugging Face hub). Run `npm run verify:embeddings` on a machine with internet; it checks 384 dimensions and that "peaceful sunrise walk at an ancient shrine" is closer to a dawn-at-temple-ruins activity than to a pizza lunch. |
