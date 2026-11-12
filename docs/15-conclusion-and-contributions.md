# 15. Conclusion, future enhancements, team contributions

## Conclusion
TripSync turns a pile of bookings, plans and receipts into one consistent model. Relational data lives in PostgreSQL, where constraints, triggers, views and transactions keep money and schedules correct *no matter which client writes them*; the variable, descriptive part of an activity lives in MongoDB, protected by a validator and summarised with aggregation pipelines; and pgvector adds search by meaning next to the rows it describes, with an honest full-text fallback. The application layer enforces who may do what, and the three stores are tied together by an explicit, repairable consistency strategy rather than by hope. The result is verified by 36 unit, 39 database, 45 HTTP and 20 browser steps (see [12](12-testing.md)), and the limits of that verification are stated openly.

## Future enhancements
* E-mail invitations; join-by-link with role.
* Minimal-transfer settlement ("A pays B ₹X") instead of per-expense gross settlement.
* Multi-currency expenses with stored exchange rates.
* Real-time collaboration (SSE/WebSocket), activity comments (MongoDB), file attachments for tickets.
* Per-trip timezones; map view with MongoDB 2dsphere queries; travel-time estimates between consecutive activities.
* Redis-backed rate limiting and token revocation; refresh tokens.
* Outbox table + background worker for MongoDB/embedding synchronisation instead of inline best-effort steps.
* Upgrade the embedding runtime to the maintained `@huggingface/transformers` v3 where native downloads are allowed (clears most `npm audit` findings).

## Team contributions *(to be completed by the team — not generated)*
The requirements ask that each member has clearly defined responsibilities across **both database and application development**, and that Git commits show individual contributions. Fill this in truthfully from your own work and `git log --author`:

| Member | Database responsibilities | Application responsibilities | Example commits |
|---|---|---|---|
| *Name 1* | | | |
| *Name 2* | | | |

Suggested split if you have not yet agreed one: **Member A** — PostgreSQL schema/constraints/triggers/views, migrations, SQL queries and index benchmark, relational documentation; trips/bookings/budget API and UI. **Member B** — MongoDB model/validator/aggregations, pgvector/search/embedding pipeline, cross-database consistency; auth/roles, activities/conflict engine, admin UI. Both: tests for their own parts and the demonstration.

> ⚠ This repository's history before the final upgrade is yours; the upgrade itself was produced in a single working session and is not a substitute for real, individual commits. Commit in logical steps (schema → services → UI → docs) under each member's own name.
