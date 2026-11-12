# 6. SQL implementation

## DDL — CREATE / ALTER / DROP
| Statement | Where |
|---|---|
| `CREATE TABLE` (12 tables, PK/FK/UNIQUE/CHECK/DEFAULT) | [`prisma/migrations/20261030000100_init`](../prisma/migrations/20261030000100_init/migration.sql), [`…0200_search_index`](../prisma/migrations/20261030000200_search_index/migration.sql) |
| `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` (all 20 foreign keys are added with ALTER, as Prisma does) | `…0100_init` |
| `CREATE INDEX` (B-tree composite/unique, **GIN**, **HNSW**) | `…0100_init`, `…0200_search_index` |
| `CREATE VIEW`, `CREATE FUNCTION`, `CREATE TRIGGER`, `CREATE CONSTRAINT TRIGGER` | `…0300_integrity_triggers`, `…0400_reporting_views` |
| `CREATE` / `ALTER ADD COLUMN, ADD CONSTRAINT, ALTER TYPE, DROP COLUMN` / `DROP INDEX` / `DROP TABLE` on a scratch table | [`sql/ddl_demo.sql`](sql/ddl_demo.sql) → [output](sql/ddl_demo.output.txt) (also asserted by an automated test) |
| `DROP INDEX` / `CREATE INDEX` with `EXPLAIN ANALYZE` | [`sql/index_demo.sql`](sql/index_demo.sql) → [output](sql/index_demo.output.txt) |

Apply everything to an empty database: `npm run db:migrate` (or `psql -f` each `migration.sql` in order — this is what the tests do).

## DML — INSERT / UPDATE / DELETE / SELECT
[`sql/dml_demo.sql`](sql/dml_demo.sql) (rolled back, so it is safe to run anywhere) → [real output](sql/dml_demo.output.txt):
it inserts a user, trip, organizer, expense and exact split (deferred constraint), updates the trip, selects with a join + aggregate and
deletes the expense, proving the `ON DELETE CASCADE` (`splits_left_after_delete = 0`).
In the running application the same operations happen through the API: every form in the UI ends in a parameterised `INSERT`/`UPDATE`/`DELETE` issued by Prisma or `$queryRaw` with bound parameters.

## Important queries
[`sql/queries.sql`](sql/queries.sql) contains 15 annotated queries; [`sql/queries.output.txt`](sql/queries.output.txt) is their **actual output** on the seeded database (0 errors).

| # | Concept | Question answered |
|---|---|---|
| Q1 | JOIN, ORDER BY | Who is on which trip, in what role |
| Q2 | Multi-table JOIN (same table twice) | Transport legs with departure and arrival names |
| Q3 | GROUP BY, aggregates, **HAVING** | Expense categories with totals above a threshold |
| Q4 | **Subquery** (correlated) | Expenses above their trip's average |
| Q5 | `NOT EXISTS` | Destinations without accommodation |
| Q6 | **Window function** | Running total of spend |
| Q7–Q9 | **Views** | Budget vs actual · balances · unified timeline |
| Q10 | **Stored function** | Dashboard headline numbers |
| Q11 | Self-join on time ranges | Overlapping activities |
| Q12 | Range-overlap join | Activities touching the hotel check-out hour (the seeded hard conflict) |
| Q13 | **Full-text search** (GIN) | Ranked match for `temple:* \| river:*` |
| Q14 | Aggregate over time arithmetic | Hours planned per activity type |
| Q15 | LEFT JOIN + GROUP BY | Admin report of users and trip counts |

### Excerpt of real output (copied verbatim from `sql/queries.output.txt`)
```
--- Q7 [VIEW] Budget vs actual per category (vw_budget_vs_actual)
   category    | planned |  spent  | remaining | utilization_pct 
---------------+---------+---------+-----------+-----------------
 accommodation | 4000.00 | 3200.00 |    800.00 |            80.0
 activities    | 1500.00 |       0 |   1500.00 |             0.0
 food          | 3000.00 |  451.00 |   2549.00 |            15.0
 shopping      | 1000.00 |       0 |   1000.00 |             0.0
 transport     | 2000.00 | 1700.00 |    300.00 |            85.0
(5 rows)

--- Q8 [VIEW + LEFT JOINs inside] Who owes what (vw_member_balances)
 name  | total_paid | total_share | net_balance | dues_outstanding 
-------+------------+-------------+-------------+------------------
 Ronak |    4900.00 |     2675.50 |     2224.50 |           225.50
 Priya |          0 |           0 |           0 |                0
 Arjun |     451.00 |     2675.50 |    -2224.50 |          2450.00
(3 rows)

--- Q10 [stored function] Headline numbers for the dashboard (fn_trip_stats)
 total_destinations | total_transports | total_accommodations | total_activities | total_members | total_planned | total_spent | trip_duration_days 
--------------------+------------------+----------------------+------------------+---------------+---------------+-------------+--------------------
                  3 |                2 |                    1 |                7 |             3 |      11500.00 |     5351.00 |                  5
(1 row)

--- Q12 [range overlap with JOIN] Activities that touch the hotel check-out hour (hard conflict, as the app computes it)
                title                |     start_time      |      end_time       |           hotel            |      check_out      
-------------------------------------+---------------------+---------------------+----------------------------+---------------------
 Lotus Mahal & Elephant Stables Walk | 2026-12-23 10:15:00 | 2026-12-23 12:00:00 | Hampi Heritage Guest House | 2026-12-23 11:00:00
(1 row)
```
(See the output file for the complete, unabridged results.)

## Integrity demonstrations (automated)
`tests/db/constraints.test.ts` and `advanced.test.ts` prove, against a database built from the migrations, that the database itself rejects: plain-text passwords, malformed e-mail, bad roles, reversed dates, a booking pointing at another trip's destination, activities outside the trip, removing the last organizer, shrinking a trip around scheduled items, non-member payers, and splits that do not add up (including the full rollback of the expense row). See [12-testing.md](12-testing.md).
