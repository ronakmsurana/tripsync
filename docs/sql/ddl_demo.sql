-- =====================================================================
-- DDL demonstration: CREATE / ALTER / DROP on a scratch table
--   psql "$DATABASE_URL" -f docs/sql/ddl_demo.sql
-- (The real schema is created by prisma/migrations/*; see docs/03-relational-schema.md)
-- =====================================================================
DROP TABLE IF EXISTS place_review;

CREATE TABLE place_review (                     -- CREATE TABLE with PK, FK, NOT NULL, CHECK, DEFAULT
    review_id  SERIAL PRIMARY KEY,
    trip_id    INTEGER NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
    place      VARCHAR(100) NOT NULL,
    stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE place_review ADD COLUMN comment TEXT;                                   -- ALTER: add a column
ALTER TABLE place_review ADD CONSTRAINT uq_review_once UNIQUE (trip_id, place);     -- ALTER: add a constraint
ALTER TABLE place_review ALTER COLUMN place TYPE VARCHAR(200);                      -- ALTER: change a type
CREATE INDEX idx_review_trip ON place_review (trip_id, stars DESC);                 -- CREATE INDEX

\d place_review

DROP INDEX idx_review_trip;                                                         -- DROP INDEX
ALTER TABLE place_review DROP COLUMN comment;                                       -- ALTER: drop a column
DROP TABLE place_review;                                                            -- DROP TABLE
