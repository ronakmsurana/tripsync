-- =====================================================================
-- Migration 0002 — Search index: pgvector (semantic) + tsvector (full text)
-- One row per activity. The row is created together with the itinerary slot,
-- the embedding is filled in afterwards (sync_status 'pending' -> 'synced'),
-- so keyword search works immediately and semantic search catches up.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "activity_embeddings" (
    "embedding_id"    SERIAL        NOT NULL,
    "mongo_doc_id"    VARCHAR(24)   NOT NULL,
    "trip_id"         INTEGER       NOT NULL,
    "title"           VARCHAR(200)  NOT NULL,
    "content"         TEXT          NOT NULL,
    "embedding"       vector(384),
    "embedding_model" VARCHAR(100),
    "sync_status"     VARCHAR(10)   NOT NULL DEFAULT 'pending',
    -- Generated column: always consistent with title/content, no trigger required.
    "search_vector"   tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("title", '')),   'A') ||
        setweight(to_tsvector('english', coalesce("content", '')), 'B')
    ) STORED,
    "updated_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_embeddings_pkey" PRIMARY KEY ("embedding_id"),
    CONSTRAINT "ck_activity_embeddings_mongo_id" CHECK ("mongo_doc_id" ~ '^[0-9a-f]{24}$'),
    CONSTRAINT "ck_activity_embeddings_status"   CHECK ("sync_status" IN ('pending', 'synced')),
    -- A row may only be 'synced' when it really carries a vector (and vice versa).
    CONSTRAINT "ck_activity_embeddings_consistent" CHECK (
        ("sync_status" = 'synced'  AND "embedding" IS NOT NULL AND "embedding_model" IS NOT NULL) OR
        ("sync_status" = 'pending')
    )
);

CREATE UNIQUE INDEX "activity_embeddings_mongo_doc_id_key" ON "activity_embeddings"("mongo_doc_id");
CREATE INDEX "activity_embeddings_trip_id_sync_status_idx" ON "activity_embeddings"("trip_id", "sync_status");

-- Full-text search (inverted index)
CREATE INDEX "idx_activity_fts" ON "activity_embeddings" USING GIN ("search_vector");

-- Approximate-nearest-neighbour index for cosine distance (pgvector >= 0.5)
CREATE INDEX "idx_activity_embedding_hnsw" ON "activity_embeddings" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "activity_embeddings"
    ADD CONSTRAINT "activity_embeddings_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
