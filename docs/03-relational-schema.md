# 3. Relational schema

Notation: **PK** primary key (underlined idea), *FK* foreign key, `UQ` unique. Types and every CHECK constraint are listed
in the generated [data dictionary](04-data-dictionary.md).

```
users            (user_id PK, name, email UQ, password_hash, phone?, role, status, created_at, updated_at)
trips            (trip_id PK, trip_name, description?, start_date, end_date, currency, status,
                  created_by FK→users, created_at, updated_at)
trip_members     (trip_id FK→trips, user_id FK→users, member_role, joined_at, status;   PK(trip_id, user_id))
destinations     (destination_id PK, trip_id FK→trips, name, location, arrival_date, departure_date, notes?;
                  UQ(trip_id, destination_id))
transports       (transport_id PK, trip_id, transport_type, provider,
                  departure_destination_id, arrival_destination_id, departure_time, arrival_time,
                  booking_reference?, cost, status;
                  FK(trip_id, departure_destination_id)→destinations(trip_id, destination_id),
                  FK(trip_id, arrival_destination_id)  →destinations(trip_id, destination_id),
                  FK(trip_id)→trips;  UQ(trip_id, booking_reference))
accommodations   (accommodation_id PK, trip_id, destination_id, name, address?, check_in, check_out,
                  booking_reference?, cost, status;
                  FK(trip_id, destination_id)→destinations(trip_id, destination_id), FK(trip_id)→trips;
                  UQ(trip_id, booking_reference))
expenses         (expense_id PK, trip_id FK→trips, paid_by FK→users, category, amount, description?, expense_date, created_at)
expense_splits   (split_id PK, expense_id FK→expenses, user_id FK→users, share_amount, is_settled;  UQ(expense_id, user_id))
payments         (payment_id PK, expense_id FK→expenses, paid_by FK→users, amount, payment_method,
                  transaction_id? UQ, paid_at, status)
budgets          (budget_id PK, trip_id FK→trips, category, planned_amount, remarks?;  UQ(trip_id, category))
itinerary_slots  (slot_id PK, trip_id FK→trips, destination_id? FK→destinations, mongo_doc_id UQ, slot_type, title,
                  start_time, end_time, is_locked, created_by FK→users, created_at)
activity_embeddings
                 (embedding_id PK, mongo_doc_id UQ, trip_id FK→trips, title, content, embedding vector(384)?,
                  embedding_model?, sync_status, search_vector tsvector GENERATED, updated_at)
```

## ER → relational mapping decisions
1. Each strong entity became a table with a surrogate integer key (`SERIAL`).
2. The M:N **User–Trip** relationship became `trip_members` with a composite primary key and relationship attributes.
3. 1:N relationships became foreign keys on the "many" side; `ON DELETE CASCADE` where the child cannot exist without the trip, `RESTRICT` where deleting would silently lose bookings (destinations used by transport/stays), `SET NULL` for the optional activity→destination link.
4. The "two roles of Destination in Transport" became two foreign keys; both are **composite** with `trip_id`, tying them to the same trip.
5. The expense → per-person share decomposition (`expense_splits`) removes a repeating group from `expenses`.

## Normalisation
* All tables are in **3NF**: every non-key attribute depends on the key, the whole key and nothing but the key. Derived money totals (spent, remaining, balances) are **not stored**; they are computed by views, so they cannot become inconsistent.
* **Deliberate, documented denormalisation:** the activity `title` is duplicated in `itinerary_slots` (timeline/conflict queries need no MongoDB round-trip) and in `activity_embeddings` (search results/ranking). `activity_embeddings.content` is the embedded text derived from the MongoDB document. Both are rewritten in the same PostgreSQL transaction as the slot, and `reconcile()` repairs any drift.

## Constraints at a glance
* **Entity integrity:** every table has a primary key.
* **Referential integrity:** 20 foreign keys (including 3 composite) with explicit delete rules.
* **Domain integrity:** 39 named CHECK constraints (enumerations, `end > start`, `amount > 0`, e-mail/phone/bcrypt formats, `vector` dimension via the type, `object-id` format).
* **Business rules in triggers:** inside trip dates, one organizer minimum, same-trip destination, member-only payers/splits, split sum = expense amount (deferred), no shrinking a trip around scheduled items. See [09](09-advanced-database-features.md).

Create/alter statements: [`../prisma/migrations/`](../prisma/migrations/) (`0001_init` … `0004_reporting_views`).
