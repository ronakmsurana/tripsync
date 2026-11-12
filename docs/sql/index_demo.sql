-- =====================================================================
-- Index demonstration with a realistic volume (150,000 expenses, 1,500 trips).
-- Run it on a SCRATCH database that already has the TripSync migrations applied:
--   createdb tripsync_perf && for f in prisma/migrations/*/migration.sql; do psql tripsync_perf -f $f; done
--   psql tripsync_perf -f docs/sql/index_demo.sql
-- Needs a superuser (it disables triggers for the bulk load only).
-- =====================================================================
SET session_replication_role = replica;      -- bulk load: skip integrity triggers (load only!)
INSERT INTO users (name, email, password_hash)
VALUES ('Perf User', 'perf@example.com', '$2b$12$' || repeat('a', 53));
INSERT INTO trips (trip_name, start_date, end_date, created_by)
SELECT 'Trip ' || g, '2027-01-01', '2027-01-10', (SELECT user_id FROM users WHERE email='perf@example.com') FROM generate_series(1, 1500) g;
INSERT INTO expenses (trip_id, paid_by, category, amount, expense_date)
SELECT t.trip_id, (SELECT user_id FROM users WHERE email='perf@example.com'),
       (ARRAY['transport','accommodation','food','activities','shopping','other'])[1 + (g % 6)],
       10 + (g % 500), '2027-01-05'
FROM trips t, generate_series(1, 100) g WHERE t.trip_name LIKE 'Trip %';
SET session_replication_role = origin;
ANALYZE expenses;

\echo '=== WITH index expenses_trip_id_category_idx ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT category, SUM(amount) FROM expenses WHERE trip_id = (SELECT MIN(trip_id) + 700 FROM trips) AND category = 'food' GROUP BY category;

DROP INDEX expenses_trip_id_category_idx;               -- DDL: DROP INDEX
\echo '=== WITHOUT the index (sequential scan of every row) ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT category, SUM(amount) FROM expenses WHERE trip_id = (SELECT MIN(trip_id) + 700 FROM trips) AND category = 'food' GROUP BY category;

CREATE INDEX expenses_trip_id_category_idx ON expenses (trip_id, category);   -- restore it
ANALYZE expenses;
\echo '=== index restored ==='
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT category, SUM(amount) FROM expenses WHERE trip_id = (SELECT MIN(trip_id) + 700 FROM trips) AND category = 'food' GROUP BY category;
