# 12. Testing — plan and actual results

> Every number below was observed in a real run; the raw logs are in [`test-results/`](test-results/). Where something could **not** be tested it is listed under *Not verified*.

## Environment of the recorded run
Ubuntu 24.04 · Node 22.22.2 · Next.js 16.4.3 **production build** (`next build` + `next start`) · PostgreSQL 16.13 with pgvector 0.6.0 · MongoDB 8.3.7 · headless Firefox 159 driven by Selenium · databases rebuilt from scratch by applying the four migrations, then seeded (twice, to prove idempotency — see [`test-results/database-setup.txt`](test-results/database-setup.txt)).

## Summary
| Layer | Command | Result | Log |
|---|---|---|---|
| Static | `npm run lint`, `npm run typecheck` | **0 errors, 0 warnings** | [static-checks.txt](test-results/static-checks.txt) |
| Build | `npm run build` | **compiled successfully**, all pages and 47 API endpoints | – |
| Unit (pure logic) | `npm test` | **36 / 36 passed** (5 files) | [unit.txt](test-results/unit.txt) |
| Database | `npm run test:db` | **39 / 39 passed** (3 files) on a throw-away DB built from the migrations | [database.txt](test-results/database.txt) |
| API end-to-end (HTTP, real PostgreSQL + MongoDB) | `npm run test:api` | **45 / 45 passed** | [api.txt](test-results/api.txt) |
| Browser end-to-end (Selenium + Firefox) | `npm run test:ui` | **20 / 20 steps passed** | [ui-browser.txt](test-results/ui-browser.txt) |
| SQL / Mongo demos | `psql -f docs/sql/*.sql`, `npm run docs:mongo` | executed with 0 errors; outputs saved | [sql/](sql/), [mongo/](mongo/) |

## What each layer proves
| File | Tests | Highlights |
|---|---|---|
| `tests/unit/money.test.ts` | 6 | exact minor-unit parsing; rejects `1.005`, `0.1+0.2`, negatives, `1e3`; splits **always** sum to the total (incl. 1 paisa / 3 people); no float drift from DB decimals |
| `tests/unit/time.test.ts` | 3 | real calendar validation; wall-clock round trip without timezone shift |
| `tests/unit/validation.test.ts` | 9 | password rules, e-mail normalisation, date/time/money/booking/activity/search schemas |
| `tests/unit/conflictEngine.test.ts` | 11 | check-out collision (+ suggested 11:00–12:45); **middle of a multi-day stay is not a conflict**; check-in window; per-mode boarding buffers; touching windows; soft vs hard; cancelled bookings; free-slot search (inside the trip, avoiding others, `null` if no room) |
| `tests/unit/errors-and-security.test.ts` | 7 | trigger messages → friendly 4xx without SQL leakage; unknown errors → generic 500; rate limiter; tsquery sanitising vs `'; DROP TABLE`; vector literal |
| `tests/db/constraints.test.ts` | 16 | the **database itself** rejects: plain-text password, bad e-mail/role/phone, duplicate e-mail, reversed dates, bad currency/status, reversed transport times, same endpoints, negative cost, cross-trip destination (composite FK), outside-trip schedule (4 tables), trip shrink, foreign destination on a slot, last-organizer delete/demote/deactivate; `ON DELETE CASCADE` leaves no orphans; `RESTRICT` protects used destinations |
| `tests/db/advanced.test.ts` | 15 | deferred split-sum trigger commits/rolls back **the expense row too**; non-member payer; auto-settled payer share; `fn_settle_member_dues` (atomic, idempotent, balances net to zero); views (FULL JOIN of unbudgeted categories, timeline order, `fn_trip_stats`); **pgvector cosine ordering** (scores 1.0, 0.7071, 0), dimension check, `synced` ⇒ vector CHECK; FTS ranking; GIN + HNSW exist; DDL CREATE/ALTER/DROP |
| `tests/db/vector-service.test.ts` | 8 | the app's own index code: pending→synced lifecycle, offline-model fallback leaves rows pending, `reindexPending` idempotent, cosine ranking, trip scoping, stale-vector invalidation on edit, unchanged text keeps its vector, delete removes from both searches *(embedding function stubbed — see [08](08-vector-search.md))* |
| `tests/api/api.test.ts` | 45 | 10 groups: authentication (bcrypt, cookie flags, forged cookie, throttle, CSRF origin) · trips CRUD/search · authorization (stranger gets 404 on 11 resources + mutations) · destinations/transport/stays + IDOR attempts · members & roles · expenses/budget/settlement arithmetic · activities across both databases + conflicts · search honesty · dashboard & admin (suspension takes effect immediately, reconcile repairs injected drift) · trip delete cleans PostgreSQL **and** MongoDB |
| `tests/e2e/ui.e2e.mjs` | 20 steps | see the journey below |

## The required user journey (browser test, real UI)
| # | Required step | Test step (all ✓) |
|---|---|---|
| 1 | Register a new account | registration form validates (weak password stays on page) and creates the account |
| 2 | Log in | sign out, sign back in (wrong password shows an error first) |
| 3 | Create a trip | create a trip from the dashboard |
| 4 | Add destinations and activities | second destination; activity |
| 5 | Add transportation and accommodation | transport booking; stay |
| 6 | Record expenses, verify budget | budget ₹5,000 + expense ₹1,234.50 ⇒ shows ₹1,234.5 spent and ₹3,765.5 remaining |
| 7 | Trigger and inspect a conflict | activity at 10:15–12:00 vs check-out 11:00 ⇒ conflict panel, then "use suggested time" |
| 8 | Edit and delete relevant records | edit/delete are exercised in the API suite for every entity (destinations, transport, stays, expenses, activities, members, budgets, trip) |
| 9 | Refresh and verify persistence | full page reload shows trip, activity, expense |
| 10 | Log out and in again | ✓ |
| 11 | Another user cannot open the trip | second account gets "Trip not found" at the first user's URL |
| 12 | Dashboard and search show correct data | dashboard search/filters; activity search labels its engine; seeded trip shows timeline, collision banner, every tab |

Also in the browser run: viewer sees no add/edit controls; the admin page is hidden from normal users and works for the admin; **no failed network requests** during the journey; the architecture page uses the app's light theme; **no horizontal overflow at 390 px** on `/`, `/login`, `/dashboard`, `/dashboard/1`.

## Manual / acceptance test cases (for the demonstration)
| ID | Steps | Expected |
|---|---|---|
| TC-01 | Register with password `short` | Rejected with a field message; stays on the form |
| TC-02 | Register, then register again with the same e-mail | Second attempt: "An account with this email already exists." |
| TC-03 | Log in with a wrong password 11× | 429 "Too many attempts" |
| TC-04 | Open another user's trip URL | "Trip not found" |
| TC-05 | Viewer opens a trip | No *Add Activity*, *Add Expense*, *Edit Trip* buttons |
| TC-06 | Add an activity from 10:15 to 12:00 on check-out day (check-out 11:00) | Amber conflict panel, suggested 11:00 – 12:45; **Save anyway** also possible |
| TC-07 | Add an activity before the trip starts | "Activities must fall within the trip dates" |
| TC-08 | Add expense `100.01` split between 2 members | Shares 50.01 + 50.00 (sum exact) |
| TC-09 | Add expense `1.005` | Rejected (max 2 decimals) |
| TC-10 | Make the last organizer a viewer | 409 "A trip must keep at least one organizer." |
| TC-11 | Settle a member's share | Dues → 0, a payment row exists, balances still sum to 0; second click settles nothing |
| TC-12 | Edit an expense after it was settled | 409 "already has settlement payments" |
| TC-13 | Search "temple sunrise" with the model unavailable | Badge *Keyword · full-text* and the notice that semantic search is unavailable |
| TC-14 | Delete an activity, check MongoDB and `activity_embeddings` | Gone from PostgreSQL, the index and MongoDB |
| TC-15 | Admin suspends a user who is logged in elsewhere | That user's next request returns 401 |
| TC-16 | Stop MongoDB, create an activity | 503 "activity store unavailable"; no row left in PostgreSQL |

*TC-16 was reasoned about and implemented (compensation code) but not exercised by an automated test; it is the one failure-injection path left to demonstrate by hand.*

## Defects found by this testing (and fixed)
| Found by | Defect | Fix |
|---|---|---|
| Audit | The original UI ran entirely on a mock-data module and the login page silently logged in a fake demo user on *any* failure; the API was never called | Whole frontend rewired to the real API; mock module and demo shortcuts removed |
| Audit | Original conflict engine treated every activity during a multi-day hotel stay as a hard conflict, and queried the database once per slot | Rewritten as pure functions; stays only block their check-in/check-out windows (unit-tested) |
| Audit | Budget view dropped categories that had spend but no budget, understating totals; a trip-summary function subtracted two dates with `EXTRACT(DAY …)` (invalid) | `FULL OUTER JOIN` view; `fn_trip_stats` (both tested) |
| Audit | Semantic search accepted an optional trip id (cross-trip leak); activity delete/trip delete left MongoDB documents; missing JWT secret fell back to a constant | Search always trip-scoped and membership-checked; cascading purge + reconcile; secret mandatory |
| API test | Keyword search used AND semantics, so "temple sunrise" matched nothing | Prefix-OR tsquery, ranked |
| API test | After one member settled, "net should be 0" failed: settlement pays *gross* dues and the other direction still exists | Not a bug in the data, a wrong expectation — the view now also exposes `dues_outstanding`, the UI shows it, and the test asserts the real invariants (conserved money; all zero once everyone settled) |
| Browser test | **Revisiting the Experiences tab re-opened a blank "Add Activity" form** | "open requested" state moved to the page and cleared on close |
| Review | Session cookie was `Secure` whenever `NODE_ENV=production`, which breaks login over plain-HTTP demos | `Secure` only when the request actually arrived over HTTPS |
| DB demo | The demo script's fake password hash was rejected by `ck_users_password_is_bcrypt` | (The constraint worked; the demo hash was corrected.) |

## Not verified (be explicit in the demonstration)
* **The real embedding model** — not downloadable where this was built; its quality and the `semantic` branch of the UI badge are untested end to end. Run `npm run verify:embeddings`.
* **`prisma migrate deploy`** — the Prisma schema-engine binary could not be downloaded; migrations were applied with `psql` in order (also how the DB tests build their database).
* Browsers other than Firefox; automated accessibility checks; load/performance testing beyond the single index benchmark.
* `docker compose` file; MongoDB-outage failure injection (TC-16).
