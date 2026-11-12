# Data Dictionary (generated from the live PostgreSQL schema)

> Regenerate with `node scripts/gen-data-dictionary.mjs`. Do not edit by hand.

## `accommodations`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `accommodation_id` | `integer` | no | `nextval('accommodations_accommodation_id_seq'::regclass)` | PK |
| `trip_id` | `integer` | no |  | FK |
| `destination_id` | `integer` | no |  | FK |
| `name` | `character varying(200)` | no |  |  |
| `address` | `character varying(500)` | yes |  |  |
| `check_in` | `timestamp(3) without time zone` | no |  |  |
| `check_out` | `timestamp(3) without time zone` | no |  |  |
| `booking_reference` | `character varying(100)` | yes |  |  |
| `cost` | `numeric(12,2)` | no | `0` |  |
| `status` | `character varying(20)` | no | `'confirmed'::character varying` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_accommodations_cost` | `CHECK ((cost >= (0)::numeric))` |
| CHECK | `ck_accommodations_name_not_blank` | `CHECK ((length(btrim((name)::text)) > 0))` |
| CHECK | `ck_accommodations_status` | `CHECK (((status)::text = ANY ((ARRAY['confirmed'::character varying, 'pending'::character varying, 'cancelled'::character varying])::text[])))` |
| CHECK | `ck_accommodations_time_order` | `CHECK ((check_out > check_in))` |
| FOREIGN KEY | `accommodations_trip_id_destination_id_fkey` | `FOREIGN KEY (trip_id, destination_id) REFERENCES destinations(trip_id, destination_id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| FOREIGN KEY | `accommodations_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE UNIQUE INDEX accommodations_trip_id_booking_reference_key ON accommodations USING btree (trip_id, booking_reference)`
- `CREATE INDEX accommodations_trip_id_check_in_check_out_idx ON accommodations USING btree (trip_id, check_in, check_out)`

**Triggers**

- `trg_accommodations_window` — BEFORE INSERT OR UPDATE ON accommodations FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window()

## `activity_embeddings`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `embedding_id` | `integer` | no | `nextval('activity_embeddings_embedding_id_seq'::regclass)` | PK |
| `mongo_doc_id` | `character varying(24)` | no |  |  |
| `trip_id` | `integer` | no |  | FK |
| `title` | `character varying(200)` | no |  |  |
| `content` | `text` | no |  |  |
| `embedding` | `vector(384)` | yes |  |  |
| `embedding_model` | `character varying(100)` | yes |  |  |
| `sync_status` | `character varying(10)` | no | `'pending'::character varying` |  |
| `search_vector` | `tsvector` | yes | *generated* |  |
| `updated_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_activity_embeddings_consistent` | `CHECK (((((sync_status)::text = 'synced'::text) AND (embedding IS NOT NULL) AND (embedding_model IS NOT NULL)) OR ((sync_status)::text = 'pending'::text)))` |
| CHECK | `ck_activity_embeddings_mongo_id` | `CHECK (((mongo_doc_id)::text ~ '^[0-9a-f]{24}$'::text))` |
| CHECK | `ck_activity_embeddings_status` | `CHECK (((sync_status)::text = ANY ((ARRAY['pending'::character varying, 'synced'::character varying])::text[])))` |
| FOREIGN KEY | `activity_embeddings_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE UNIQUE INDEX activity_embeddings_mongo_doc_id_key ON activity_embeddings USING btree (mongo_doc_id)`
- `CREATE INDEX activity_embeddings_trip_id_sync_status_idx ON activity_embeddings USING btree (trip_id, sync_status)`
- `CREATE INDEX idx_activity_embedding_hnsw ON activity_embeddings USING hnsw (embedding vector_cosine_ops)`
- `CREATE INDEX idx_activity_fts ON activity_embeddings USING gin (search_vector)`

**Triggers**

- `trg_activity_embeddings_updated_at` — BEFORE UPDATE ON activity_embeddings FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()

## `budgets`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `budget_id` | `integer` | no | `nextval('budgets_budget_id_seq'::regclass)` | PK |
| `trip_id` | `integer` | no |  | FK |
| `category` | `character varying(50)` | no |  |  |
| `planned_amount` | `numeric(12,2)` | no |  |  |
| `remarks` | `text` | yes |  |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_budgets_amount` | `CHECK ((planned_amount >= (0)::numeric))` |
| CHECK | `ck_budgets_category` | `CHECK (((category)::text = ANY ((ARRAY['transport'::character varying, 'accommodation'::character varying, 'food'::character varying, 'activities'::character varying, 'shopping'::character varying, 'other'::character varying])::text[])))` |
| FOREIGN KEY | `budgets_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE UNIQUE INDEX budgets_trip_id_category_key ON budgets USING btree (trip_id, category)`

## `destinations`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `destination_id` | `integer` | no | `nextval('destinations_destination_id_seq'::regclass)` | PK |
| `trip_id` | `integer` | no |  | FK |
| `name` | `character varying(200)` | no |  |  |
| `location` | `character varying(300)` | no |  |  |
| `arrival_date` | `date` | no |  |  |
| `departure_date` | `date` | no |  |  |
| `notes` | `text` | yes |  |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_destinations_date_order` | `CHECK ((departure_date >= arrival_date))` |
| CHECK | `ck_destinations_name_not_blank` | `CHECK ((length(btrim((name)::text)) > 0))` |
| FOREIGN KEY | `destinations_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE INDEX destinations_trip_id_arrival_date_idx ON destinations USING btree (trip_id, arrival_date)`
- `CREATE UNIQUE INDEX destinations_trip_id_destination_id_key ON destinations USING btree (trip_id, destination_id)`

**Triggers**

- `trg_destinations_window` — BEFORE INSERT OR UPDATE ON destinations FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window()

## `expense_splits`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `split_id` | `integer` | no | `nextval('expense_splits_split_id_seq'::regclass)` | PK |
| `expense_id` | `integer` | no |  | FK |
| `user_id` | `integer` | no |  | FK |
| `share_amount` | `numeric(12,2)` | no |  |  |
| `is_settled` | `boolean` | no | `false` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_expense_splits_share` | `CHECK ((share_amount >= (0)::numeric))` |
| FOREIGN KEY | `expense_splits_expense_id_fkey` | `FOREIGN KEY (expense_id) REFERENCES expenses(expense_id) ON UPDATE CASCADE ON DELETE CASCADE` |
| FOREIGN KEY | `expense_splits_user_id_fkey` | `FOREIGN KEY (user_id) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT` |

**Indexes**

- `CREATE UNIQUE INDEX expense_splits_expense_id_user_id_key ON expense_splits USING btree (expense_id, user_id)`
- `CREATE INDEX expense_splits_user_id_idx ON expense_splits USING btree (user_id)`

**Triggers**

- `trg_expense_splits_sum` — AFTER INSERT OR DELETE OR UPDATE ON expense_splits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_expense_splits_sum()
- `trg_split_member_check` — BEFORE INSERT OR UPDATE OF user_id, expense_id ON expense_splits FOR EACH ROW EXECUTE FUNCTION fn_split_member_check()

## `expenses`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `expense_id` | `integer` | no | `nextval('expenses_expense_id_seq'::regclass)` | PK |
| `trip_id` | `integer` | no |  | FK |
| `paid_by` | `integer` | no |  | FK |
| `category` | `character varying(50)` | no |  |  |
| `amount` | `numeric(12,2)` | no | `0` |  |
| `description` | `text` | yes |  |  |
| `expense_date` | `date` | no |  |  |
| `created_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_expenses_amount` | `CHECK ((amount > (0)::numeric))` |
| CHECK | `ck_expenses_category` | `CHECK (((category)::text = ANY ((ARRAY['transport'::character varying, 'accommodation'::character varying, 'food'::character varying, 'activities'::character varying, 'shopping'::character varying, 'other'::character varying])::text[])))` |
| FOREIGN KEY | `expenses_paid_by_fkey` | `FOREIGN KEY (paid_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| FOREIGN KEY | `expenses_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE INDEX expenses_expense_date_idx ON expenses USING btree (expense_date)`
- `CREATE INDEX expenses_paid_by_idx ON expenses USING btree (paid_by)`
- `CREATE INDEX expenses_trip_id_category_idx ON expenses USING btree (trip_id, category)`

**Triggers**

- `trg_expense_amount_matches_splits` — AFTER UPDATE OF amount ON expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_expense_splits_sum()
- `trg_expense_payer_is_member` — BEFORE INSERT OR UPDATE OF paid_by, trip_id ON expenses FOR EACH ROW EXECUTE FUNCTION fn_expense_payer_is_member()

## `itinerary_slots`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `slot_id` | `integer` | no | `nextval('itinerary_slots_slot_id_seq'::regclass)` | PK |
| `trip_id` | `integer` | no |  | FK |
| `destination_id` | `integer` | yes |  | FK |
| `mongo_doc_id` | `character varying(24)` | no |  |  |
| `slot_type` | `character varying(30)` | no |  |  |
| `title` | `character varying(200)` | no |  |  |
| `start_time` | `timestamp(3) without time zone` | no |  |  |
| `end_time` | `timestamp(3) without time zone` | no |  |  |
| `is_locked` | `boolean` | no | `false` |  |
| `created_by` | `integer` | no |  | FK |
| `created_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_itinerary_slots_mongo_id` | `CHECK (((mongo_doc_id)::text ~ '^[0-9a-f]{24}$'::text))` |
| CHECK | `ck_itinerary_slots_time_order` | `CHECK ((end_time > start_time))` |
| CHECK | `ck_itinerary_slots_title` | `CHECK ((length(btrim((title)::text)) > 0))` |
| CHECK | `ck_itinerary_slots_type` | `CHECK (((slot_type)::text = ANY ((ARRAY['sightseeing'::character varying, 'dining'::character varying, 'adventure'::character varying, 'leisure'::character varying, 'festival'::character varying, 'custom'::character varying])::text[])))` |
| FOREIGN KEY | `itinerary_slots_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| FOREIGN KEY | `itinerary_slots_destination_id_fkey` | `FOREIGN KEY (destination_id) REFERENCES destinations(destination_id) ON UPDATE CASCADE ON DELETE SET NULL` |
| FOREIGN KEY | `itinerary_slots_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE UNIQUE INDEX itinerary_slots_mongo_doc_id_key ON itinerary_slots USING btree (mongo_doc_id)`
- `CREATE INDEX itinerary_slots_trip_id_start_time_end_time_idx ON itinerary_slots USING btree (trip_id, start_time, end_time)`

**Triggers**

- `trg_itinerary_slots_window` — BEFORE INSERT OR UPDATE ON itinerary_slots FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window()
- `trg_slot_destination_same_trip` — BEFORE INSERT OR UPDATE OF destination_id, trip_id ON itinerary_slots FOR EACH ROW EXECUTE FUNCTION fn_slot_destination_same_trip()

## `payments`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `payment_id` | `integer` | no | `nextval('payments_payment_id_seq'::regclass)` | PK |
| `expense_id` | `integer` | no |  | FK |
| `paid_by` | `integer` | no |  | FK |
| `amount` | `numeric(12,2)` | no |  |  |
| `payment_method` | `character varying(50)` | no |  |  |
| `transaction_id` | `character varying(100)` | yes |  |  |
| `paid_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |
| `status` | `character varying(20)` | no | `'completed'::character varying` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_payments_amount` | `CHECK ((amount > (0)::numeric))` |
| CHECK | `ck_payments_method` | `CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'upi'::character varying, 'card'::character varying, 'bank_transfer'::character varying, 'other'::character varying])::text[])))` |
| CHECK | `ck_payments_status` | `CHECK (((status)::text = ANY ((ARRAY['completed'::character varying, 'pending'::character varying, 'failed'::character varying])::text[])))` |
| FOREIGN KEY | `payments_expense_id_fkey` | `FOREIGN KEY (expense_id) REFERENCES expenses(expense_id) ON UPDATE CASCADE ON DELETE CASCADE` |
| FOREIGN KEY | `payments_paid_by_fkey` | `FOREIGN KEY (paid_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT` |

**Indexes**

- `CREATE INDEX payments_expense_id_idx ON payments USING btree (expense_id)`
- `CREATE UNIQUE INDEX payments_transaction_id_key ON payments USING btree (transaction_id)`

## `transports`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `transport_id` | `integer` | no | `nextval('transports_transport_id_seq'::regclass)` | PK |
| `trip_id` | `integer` | no |  | FK |
| `transport_type` | `character varying(50)` | no |  |  |
| `provider` | `character varying(200)` | no |  |  |
| `departure_destination_id` | `integer` | no |  | FK |
| `arrival_destination_id` | `integer` | no |  | FK |
| `departure_time` | `timestamp(3) without time zone` | no |  |  |
| `arrival_time` | `timestamp(3) without time zone` | no |  |  |
| `booking_reference` | `character varying(100)` | yes |  |  |
| `cost` | `numeric(12,2)` | no | `0` |  |
| `status` | `character varying(20)` | no | `'confirmed'::character varying` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_transports_cost` | `CHECK ((cost >= (0)::numeric))` |
| CHECK | `ck_transports_endpoints` | `CHECK ((departure_destination_id <> arrival_destination_id))` |
| CHECK | `ck_transports_provider_not_blank` | `CHECK ((length(btrim((provider)::text)) > 0))` |
| CHECK | `ck_transports_status` | `CHECK (((status)::text = ANY ((ARRAY['confirmed'::character varying, 'pending'::character varying, 'cancelled'::character varying])::text[])))` |
| CHECK | `ck_transports_time_order` | `CHECK ((arrival_time > departure_time))` |
| CHECK | `ck_transports_type` | `CHECK (((transport_type)::text = ANY ((ARRAY['flight'::character varying, 'train'::character varying, 'bus'::character varying, 'car'::character varying, 'ferry'::character varying, 'other'::character varying])::text[])))` |
| FOREIGN KEY | `transports_trip_id_arrival_destination_id_fkey` | `FOREIGN KEY (trip_id, arrival_destination_id) REFERENCES destinations(trip_id, destination_id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| FOREIGN KEY | `transports_trip_id_departure_destination_id_fkey` | `FOREIGN KEY (trip_id, departure_destination_id) REFERENCES destinations(trip_id, destination_id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| FOREIGN KEY | `transports_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Indexes**

- `CREATE UNIQUE INDEX transports_trip_id_booking_reference_key ON transports USING btree (trip_id, booking_reference)`
- `CREATE INDEX transports_trip_id_departure_time_arrival_time_idx ON transports USING btree (trip_id, departure_time, arrival_time)`

**Triggers**

- `trg_transports_window` — BEFORE INSERT OR UPDATE ON transports FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window()

## `trip_members`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `trip_id` | `integer` | no |  | PK, FK |
| `user_id` | `integer` | no |  | PK, FK |
| `member_role` | `character varying(20)` | no | `'member'::character varying` |  |
| `joined_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |
| `status` | `character varying(20)` | no | `'active'::character varying` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_trip_members_role` | `CHECK (((member_role)::text = ANY ((ARRAY['organizer'::character varying, 'member'::character varying, 'viewer'::character varying])::text[])))` |
| CHECK | `ck_trip_members_status` | `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])))` |
| FOREIGN KEY | `trip_members_trip_id_fkey` | `FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON UPDATE CASCADE ON DELETE CASCADE` |
| FOREIGN KEY | `trip_members_user_id_fkey` | `FOREIGN KEY (user_id) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT` |

**Indexes**

- `CREATE INDEX trip_members_user_id_idx ON trip_members USING btree (user_id)`

**Triggers**

- `trg_guard_last_organizer` — BEFORE DELETE OR UPDATE ON trip_members FOR EACH ROW EXECUTE FUNCTION fn_guard_last_organizer()

## `trips`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `trip_id` | `integer` | no | `nextval('trips_trip_id_seq'::regclass)` | PK |
| `trip_name` | `character varying(200)` | no |  |  |
| `description` | `text` | yes |  |  |
| `start_date` | `date` | no |  |  |
| `end_date` | `date` | no |  |  |
| `currency` | `character(3)` | no | `'INR'::bpchar` |  |
| `status` | `character varying(20)` | no | `'planning'::character varying` |  |
| `created_by` | `integer` | no |  | FK |
| `created_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |
| `updated_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_trips_currency` | `CHECK ((currency ~ '^[A-Z]{3}$'::text))` |
| CHECK | `ck_trips_date_order` | `CHECK ((end_date >= start_date))` |
| CHECK | `ck_trips_name_not_blank` | `CHECK ((length(btrim((trip_name)::text)) > 0))` |
| CHECK | `ck_trips_status` | `CHECK (((status)::text = ANY ((ARRAY['planning'::character varying, 'confirmed'::character varying, 'ongoing'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))` |
| FOREIGN KEY | `trips_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT` |

**Indexes**

- `CREATE INDEX trips_created_by_idx ON trips USING btree (created_by)`

**Triggers**

- `trg_trips_guard_shrink` — BEFORE UPDATE OF start_date, end_date ON trips FOR EACH ROW WHEN (((old.start_date IS DISTINCT FROM new.start_date) OR (old.end_date IS DISTINCT FROM new.end_date))) EXECUTE FUNCTION fn_guard_trip_shrink()
- `trg_trips_updated_at` — BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()

## `users`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `user_id` | `integer` | no | `nextval('users_user_id_seq'::regclass)` | PK |
| `name` | `character varying(100)` | no |  |  |
| `email` | `character varying(255)` | no |  |  |
| `password_hash` | `character varying(255)` | no |  |  |
| `phone` | `character varying(20)` | yes |  |  |
| `role` | `character varying(10)` | no | `'user'::character varying` |  |
| `status` | `character varying(20)` | no | `'active'::character varying` |  |
| `created_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |
| `updated_at` | `timestamp(3) without time zone` | no | `CURRENT_TIMESTAMP` |  |

**Constraints**

| Kind | Name | Definition |
|---|---|---|
| CHECK | `ck_users_email_format` | `CHECK ((((email)::text = lower((email)::text)) AND ((email)::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)))` |
| CHECK | `ck_users_name_not_blank` | `CHECK ((length(btrim((name)::text)) > 0))` |
| CHECK | `ck_users_password_is_bcrypt` | `CHECK (((password_hash)::text ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'::text))` |
| CHECK | `ck_users_phone_format` | `CHECK (((phone IS NULL) OR ((phone)::text ~ '^[+0-9][0-9 ()-]{5,19}$'::text)))` |
| CHECK | `ck_users_role` | `CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying])::text[])))` |
| CHECK | `ck_users_status` | `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying])::text[])))` |

**Indexes**

- `CREATE UNIQUE INDEX users_email_key ON users USING btree (email)`

**Triggers**

- `trg_users_updated_at` — BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()

## Views

- `vw_budget_vs_actual`
- `vw_member_balances`
- `vw_trip_timeline`

## Functions

| Function | Arguments | Returns |
|---|---|---|
| `fn_enforce_trip_window` | `` | `trigger` |
| `fn_expense_payer_is_member` | `` | `trigger` |
| `fn_expense_splits_sum` | `` | `trigger` |
| `fn_guard_last_organizer` | `` | `trigger` |
| `fn_guard_trip_shrink` | `` | `trigger` |
| `fn_set_updated_at` | `` | `trigger` |
| `fn_settle_member_dues` | `p_trip_id integer, p_user_id integer, p_method character varying DEFAULT 'cash'::character varying` | `TABLE(settled_count integer, total_settled numeric)` |
| `fn_slot_destination_same_trip` | `` | `trigger` |
| `fn_split_member_check` | `` | `trigger` |
| `fn_trip_stats` | `p_trip_id integer` | `TABLE(total_destinations integer, total_transports integer, total_accommodations integer, total_activities integer, total_members integer, total_planned numeric, total_spent numeric, trip_duration_days integer)` |
