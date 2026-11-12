-- =====================================================================
-- DML demonstration (INSERT / UPDATE / DELETE / SELECT) inside a rolled-back
-- transaction, so it can be run against any database without leaving data.
--   psql "$DATABASE_URL" -f docs/sql/dml_demo.sql
-- =====================================================================
BEGIN;

-- INSERT: a user (the hash is only a SHAPE-valid bcrypt placeholder; the CHECK constraint rejects anything else), a trip and its organizer
INSERT INTO users (name, email, password_hash)
VALUES ('Demo Person', 'demo.person@example.com', '$2b$12$' || repeat('a', 53))
RETURNING user_id \gset
INSERT INTO trips (trip_name, start_date, end_date, created_by) VALUES ('DML Demo Trip', '2027-01-10', '2027-01-12', :user_id) RETURNING trip_id \gset
INSERT INTO trip_members (trip_id, user_id, member_role) VALUES (:trip_id, :user_id, 'organizer');

-- INSERT with a deferred constraint: expense + exact splits in the same transaction
INSERT INTO expenses (trip_id, paid_by, category, amount, expense_date) VALUES (:trip_id, :user_id, 'food', 250.00, '2027-01-10') RETURNING expense_id \gset
INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (:expense_id, :user_id, 250.00);

-- UPDATE
UPDATE trips SET status = 'confirmed', description = 'Updated by the DML demo' WHERE trip_id = :trip_id;

-- SELECT (join + aggregate)
SELECT t.trip_name, t.status, COUNT(e.expense_id) AS expenses, COALESCE(SUM(e.amount), 0) AS spent
FROM trips t LEFT JOIN expenses e ON e.trip_id = t.trip_id
WHERE t.trip_id = :trip_id GROUP BY t.trip_id;

-- DELETE: removing the expense cascades to its splits
DELETE FROM expenses WHERE expense_id = :expense_id;
SELECT COUNT(*) AS splits_left_after_delete FROM expense_splits WHERE expense_id = :expense_id;

ROLLBACK;  -- nothing is kept
