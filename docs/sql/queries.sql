-- =====================================================================
-- TripSync — important SQL queries (run against the seeded demo database)
--   psql "$DATABASE_URL" -f docs/sql/queries.sql
-- Each query states what it answers and which SQL concept it demonstrates.
-- =====================================================================
\set trip 1
\pset border 1

\echo '--- Q1 [JOIN + ORDER BY] Which trips is each person on, and in what role?'
SELECT u.name, t.trip_name, tm.member_role
FROM trip_members tm
JOIN users u ON u.user_id = tm.user_id
JOIN trips t ON t.trip_id = tm.trip_id
WHERE tm.status = 'active'
ORDER BY t.trip_name, tm.member_role, u.name;

\echo '--- Q2 [multi-table JOIN] Transport legs with their departure and arrival destination names'
SELECT tr.transport_type, tr.provider,
       d1.name AS "from", d2.name AS "to",
       tr.departure_time, tr.arrival_time, tr.cost
FROM transports tr
JOIN destinations d1 ON d1.destination_id = tr.departure_destination_id
JOIN destinations d2 ON d2.destination_id = tr.arrival_destination_id
WHERE tr.trip_id = :trip
ORDER BY tr.departure_time;

\echo '--- Q3 [GROUP BY + aggregate + HAVING] Expense categories with more than one expense, by total'
SELECT category, COUNT(*) AS expenses, SUM(amount) AS total, ROUND(AVG(amount), 2) AS average
FROM expenses
WHERE trip_id = :trip
GROUP BY category
HAVING COUNT(*) >= 1 AND SUM(amount) > 400
ORDER BY total DESC;

\echo '--- Q4 [subquery in WHERE] Expenses larger than the average expense of the same trip'
SELECT e.expense_id, e.category, e.amount, e.description
FROM expenses e
WHERE e.trip_id = :trip
  AND e.amount > (SELECT AVG(amount) FROM expenses WHERE trip_id = e.trip_id)
ORDER BY e.amount DESC;

\echo '--- Q5 [NOT EXISTS / correlated subquery] Destinations that have no accommodation booked'
SELECT d.name, d.arrival_date, d.departure_date
FROM destinations d
WHERE d.trip_id = :trip
  AND NOT EXISTS (SELECT 1 FROM accommodations a WHERE a.destination_id = d.destination_id);

\echo '--- Q6 [window function] Running total of spend by date'
SELECT expense_date, category, amount,
       SUM(amount) OVER (ORDER BY expense_date, expense_id) AS running_total
FROM expenses
WHERE trip_id = :trip
ORDER BY expense_date, expense_id;

\echo '--- Q7 [VIEW] Budget vs actual per category (vw_budget_vs_actual)'
SELECT category, planned, spent, remaining, utilization_pct
FROM vw_budget_vs_actual WHERE trip_id = :trip ORDER BY category;

\echo '--- Q8 [VIEW + LEFT JOINs inside] Who owes what (vw_member_balances)'
SELECT name, total_paid, total_share, net_balance, dues_outstanding
FROM vw_member_balances WHERE trip_id = :trip ORDER BY net_balance DESC;

\echo '--- Q9 [VIEW] Unified timeline: transport + stays + activities in one feed (vw_trip_timeline)'
SELECT item_type, title, start_time, end_time
FROM vw_trip_timeline WHERE trip_id = :trip ORDER BY start_time LIMIT 8;

\echo '--- Q10 [stored function] Headline numbers for the dashboard (fn_trip_stats)'
SELECT * FROM fn_trip_stats(:trip);

\echo '--- Q11 [self-join on time ranges] Overlapping activities in the same trip (soft conflicts)'
SELECT a.title AS activity_a, b.title AS activity_b
FROM itinerary_slots a
JOIN itinerary_slots b ON a.trip_id = b.trip_id AND a.slot_id < b.slot_id
 AND a.start_time < b.end_time AND a.end_time > b.start_time
WHERE a.trip_id = :trip;

\echo '--- Q12 [range overlap with JOIN] Activities that touch the hotel check-out hour (hard conflict, as the app computes it)'
SELECT s.title, s.start_time, s.end_time, a.name AS hotel, a.check_out
FROM itinerary_slots s
JOIN accommodations a ON a.trip_id = s.trip_id
WHERE s.trip_id = :trip
  AND s.start_time < a.check_out AND s.end_time > a.check_out - INTERVAL '60 minutes';

\echo '--- Q13 [full-text search, GIN index] Activities matching any of: temple, river  (ranked)'
SELECT title, ROUND(ts_rank_cd(search_vector, q)::numeric, 3) AS rank
FROM activity_embeddings, to_tsquery('english', 'temple:* | river:*') q
WHERE trip_id = :trip AND search_vector @@ q
ORDER BY rank DESC;

\echo '--- Q14 [aggregate over JOIN] Estimated activity cost is in MongoDB, but slots per type live here'
SELECT slot_type, COUNT(*) AS activities,
       SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) AS total_hours
FROM itinerary_slots WHERE trip_id = :trip GROUP BY slot_type ORDER BY activities DESC;

\echo '--- Q15 [admin report: LEFT JOIN + GROUP BY] Users and how many trips they are on'
SELECT u.name, u.role, COUNT(tm.trip_id) AS trips
FROM users u LEFT JOIN trip_members tm ON tm.user_id = u.user_id AND tm.status = 'active'
GROUP BY u.user_id ORDER BY trips DESC, u.name;
