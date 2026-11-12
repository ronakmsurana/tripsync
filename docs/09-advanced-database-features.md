# 9. Advanced database features

The project requires at least four. **Seven** are implemented; each is used by the running application *and* covered by an automated test.

| # | Concept | Implementation | Used by the app | Proof |
|---|---|---|---|---|
| 1 | **Transactions** | Prisma `$transaction`: trip + organizer + first destination; expense + all splits; activity slot + search-index row; MongoDB insert failure compensates the PostgreSQL rows. PostgreSQL `BEGIN … COMMIT` with a **deferred constraint trigger**. | `tripService.createTrip`, `expenseService.createExpense/updateExpense`, `activityService.createActivity` | `advanced.test.ts` "rolls EVERYTHING back (expense row too) …"; API test "nothing half-saved" |
| 2 | **Views** | `vw_trip_timeline`, `vw_budget_vs_actual` (FULL JOIN: unbudgeted categories still show), `vw_member_balances` (net = paid − share + settlements made − received; plus outstanding dues) | `/timeline`, `/budget` | `advanced.test.ts` views block; Q7–Q9 output |
| 3 | **Triggers & stored functions** | 8 trigger functions / 14 triggers: trip-window, trip-shrink guard, last-organizer guard, same-trip destination, member-only payer/splits, auto-settled payer share, **deferred split-sum constraint**, `updated_at`. Functions: `fn_trip_stats`, `fn_settle_member_dues` (atomic CTE: marks splits settled **and** inserts payments) | `fn_settle_member_dues` backs `POST /settlements`; triggers fire on every write | `constraints.test.ts`, `advanced.test.ts` |
| 4 | **Indexing** | B-tree: `(trip_id, category)`, `(trip_id, start_time, end_time)`, unique/composite keys; **GIN** on `tsvector`; **HNSW** on `vector` (see [data dictionary](04-data-dictionary.md)) | every list/aggregate query | **Measured:** [`sql/index_demo.output.txt`](sql/index_demo.output.txt) — 150,000 expenses: *Index Scan, 7 buffers, 0.11 ms* with the index vs. *Seq Scan, removed 149,983 rows, 1,286 buffers, 11.9 ms* without it |
| 5 | **Full-text search** | generated weighted `tsvector` + GIN, `to_tsquery('english', 'word:* \| word:*')`, `ts_rank_cd` | keyword search + fallback | `advanced.test.ts`, API "keyword mode" test, Q13 |
| 6 | **NoSQL aggregation** | `$group`, `$unwind`, `$facet` over `activities` | `/insights`, budget "planned activities" figure | `aggregations.output.txt`, API test "insights reflect stored documents" |
| 7 | **Vector similarity search** | pgvector cosine distance + HNSW | `/search` | see [08](08-vector-search.md) for exactly what was and was not verified |

## The business rules enforced *inside* PostgreSQL
| Rule | Mechanism | Error surfaced to the user |
|---|---|---|
| Passwords are never plain text | `CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$…{53}$')` | – (application always hashes; the DB refuses anything else) |
| Nothing scheduled outside the trip's dates | `BEFORE INSERT/UPDATE` trigger on destinations, transports, stays, slots | "That date/time falls outside the trip's start and end dates." |
| Trip dates cannot shrink around scheduled items | `BEFORE UPDATE OF start_date,end_date` trigger | "…would leave scheduled items outside the trip. Move or remove them first." |
| A trip keeps ≥ 1 organizer | `BEFORE UPDATE/DELETE` trigger on `trip_members` (cascade from deleting the trip is allowed) | "A trip must keep at least one organizer." |
| Booking → destination of the same trip | composite foreign keys | friendly pre-check + FK as last defence |
| Activity's destination is in the same trip | trigger | "That destination does not belong to this trip." |
| Payer and split users are active members | triggers | "Everyone on an expense must be an active member…" |
| **Splits sum exactly to the expense** | `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` checked at COMMIT | "The split shares must add up exactly to the expense amount." |
| `end > start`, `amount > 0`, enumerations, formats | 39 CHECK constraints | generic "database rejected that value" (plus zod field messages first) |

Trigger messages carry a `TS_<RULE>:` prefix; `src/lib/api/errors.ts` maps them to HTTP statuses and friendly text so raw database errors never reach the browser.

## Triggers vs. application checks
Every rule above is *also* checked in the service layer first, to give precise, friendly messages. The database versions are the safety net: they hold even if a second application, a script or a manual `psql` session writes the data.
