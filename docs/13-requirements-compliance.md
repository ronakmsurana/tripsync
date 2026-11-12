# 13. Requirements compliance — DBMS Experiential Learning, Level 3

Source of truth: *DBMS Level 3 Project Requirements* (Dr. Nagasundari S). ✔ = implemented **and** demonstrated/tested · ◐ = implemented, with a stated limitation · ✎ = needs input from the team.

| # | Requirement (PDF) | Status | Evidence |
|---|---|---|---|
| 1 | **Unique title, real-world problem, not simple CRUD** | ✔ / ✎ | "TripSync — Collision-Free Group Trip Planner". Beyond CRUD: conflict engine with travel buffers, exact expense splitting/settlement, cross-database consistency, semantic search. *Uniqueness within your section must be confirmed with your instructor.* [01](01-problem-and-requirements.md) |
| 2 | **Team of 2, defined responsibilities, both DB and app work** | ✎ | Template in [15](15-conclusion-and-contributions.md) — to be filled by the team. |
| 3 | **SQL (MySQL/PostgreSQL) + NoSQL + vector DB; ≥ 2 paradigms** | ✔ | PostgreSQL 16 + MongoDB + pgvector (three paradigms). [05](05-database-choice.md) |
| 4 | **Database design:** ER diagram → relational schema; entities, attributes, PK, FK, relationships, constraints; NoSQL/vector: data model, collections, indexes, embeddings, metadata, retrieval | ✔ | [02 ER](02-er-diagram.md) · [03 schema](03-relational-schema.md) · [04 dictionary](04-data-dictionary.md) · [07 Mongo](07-mongodb.md) · [08 vector](08-vector-search.md) |
| 5 | **SQL implementation:** DDL — CREATE, ALTER, DROP, PK/FK, constraints, indexes, views | ✔ | 4 migrations; [`sql/ddl_demo.sql`](sql/ddl_demo.sql) + output; views `vw_*`; [06](06-sql-implementation.md) |
| 6 | **Database operations:** INSERT/UPDATE/DELETE/SELECT; JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | ✔ | [`sql/dml_demo.sql`](sql/dml_demo.sql), [`sql/queries.sql`](sql/queries.sql) (15 queries) with captured output; used by the API |
| 7 | **≥ 4 advanced concepts** | ✔ (7) | Transactions, views, triggers + stored functions, indexing (measured), full-text search, NoSQL aggregation, vector similarity. [09](09-advanced-database-features.md) |
| 8 | **Vector DB / semantic search** (optional, recommended): what is embedded, model, storage, metric, retrieval | ◐ | Fully implemented and documented in [08](08-vector-search.md). The real model could not be downloaded in the build environment; the plumbing is tested with a stub and the fallback is tested for real — run `npm run verify:embeddings`. |
| 9 | **Next.js web interface**: forms, tables, search, filtering, dashboards | ✔ | App Router UI; browser-tested ([12](12-testing.md), [14](14-screenshots.md)) |
| 10 | **Database–application integration** through a backend/API layer; no hard-coded credentials; environment variables | ✔ | 47 API endpoints (Route Handlers); `src/lib/env.ts` validates env vars; `.env.example` has placeholders only; `.env*` git-ignored; seed passwords come from the environment |
| 11 | **Authentication and authorization, ≥ 2 roles** | ✔ | Global `user`/`admin` + per-trip `organizer`/`member`/`viewer`; matrix and tests in [10](10-architecture-security.md) |
| 12 | **Data validation at the database level; consistency and integrity** | ✔ | 39 CHECKs, 20 FKs (3 composite), UNIQUEs, 14 triggers, MongoDB `$jsonSchema`; 31 DB tests prove rejection and rollback. [09](09-advanced-database-features.md) |
| 13 | **Security**: basic DB/web practices; no plain-text passwords or credentials | ✔ | bcrypt + DB CHECK forbidding non-bcrypt values; httpOnly cookie; CSRF origin check; rate limiting; parameterised SQL; uniform errors. [10](10-architecture-security.md). `npm audit` findings are disclosed in the README. |
| 14 | **Documentation**: problem, objectives, scope, functional requirements, ER, schema, DB choice, data dictionary, implementation, queries, architecture, **screenshots**, **testing results**, conclusion & future work | ✔ | This folder, items 01–15 |
| 15 | **Git/GitHub**: source in Git, commits show individual contributions, README with setup | ✎ | README has full setup/run instructions. **Commit history and who did what are yours to provide** — nothing was fabricated. |
| 16 | **Evaluation/demonstration** contents: problem, ER, schema, implementation, queries, interface, integration, advanced features, **test cases**, **individual contribution** | ✔ / ✎ | Everything except individual contribution is documented (test cases in [12](12-testing.md)); contribution template in [15](15-conclusion-and-contributions.md) |
| 17 | **Originality** | ✎ | The design (conflict engine, three-store consistency strategy, exact settlement, reconcile) is specific to this project; no tutorial code was copied. You must be able to explain every part in the viva. |
| 18 | **Level 3 expectation**: beyond CRUD; concepts ↔ design ↔ implementation ↔ web app; DB choice justified by the data | ✔ | [05](05-database-choice.md), [09](09-advanced-database-features.md) |

## Suggested demonstration order (≈ 10 minutes)
1. Problem (landing page) → 2. ER diagram + schema (`docs/diagrams`) → 3. `psql`: try to insert a plain-text password / an activity outside the trip dates / a wrong split sum (database rejects them) →
4. Seeded trip: collision banner → *Move to 11:00–12:45* → collision gone → 5. Expenses: add an expense, show exact split and settlement; `SELECT * FROM vw_member_balances` →
6. Activity search (state honestly which engine answered); show the `activity_embeddings` row and the cosine query → 7. MongoDB: document + `npm run docs:mongo` aggregations + validator rejection →
8. `docs/sql/index_demo.output.txt` (Index Scan vs Seq Scan) → 9. Admin page: reconcile → 10. Test results.
