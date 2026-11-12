-- =====================================================================
-- Migration 0001 — Base relational schema (DDL: CREATE TABLE / ALTER TABLE)
-- Every table has a primary key, typed columns, NOT NULL rules and CHECK
-- constraints so that invalid data is rejected by the DATABASE itself,
-- independent of the application layer.
-- =====================================================================

-- ---------------------------------------------------------------- users
CREATE TABLE "users" (
    "user_id"       SERIAL          NOT NULL,
    "name"          VARCHAR(100)    NOT NULL,
    "email"         VARCHAR(255)    NOT NULL,
    "password_hash" VARCHAR(255)    NOT NULL,
    "phone"         VARCHAR(20),
    "role"          VARCHAR(10)     NOT NULL DEFAULT 'user',
    "status"        VARCHAR(20)     NOT NULL DEFAULT 'active',
    "created_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "ck_users_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "ck_users_email_format"   CHECK ("email" = lower("email") AND "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- Passwords must never be stored in plain text: only a bcrypt hash ($2a/$2b/$2y, 60 chars) is accepted.
    CONSTRAINT "ck_users_password_is_bcrypt" CHECK ("password_hash" ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
    CONSTRAINT "ck_users_phone_format"   CHECK ("phone" IS NULL OR "phone" ~ '^[+0-9][0-9 ()-]{5,19}$'),
    CONSTRAINT "ck_users_role"           CHECK ("role" IN ('user', 'admin')),
    CONSTRAINT "ck_users_status"         CHECK ("status" IN ('active', 'suspended'))
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ---------------------------------------------------------------- trips
CREATE TABLE "trips" (
    "trip_id"     SERIAL        NOT NULL,
    "trip_name"   VARCHAR(200)  NOT NULL,
    "description" TEXT,
    "start_date"  DATE          NOT NULL,
    "end_date"    DATE          NOT NULL,
    "currency"    CHAR(3)       NOT NULL DEFAULT 'INR',
    "status"      VARCHAR(20)   NOT NULL DEFAULT 'planning',
    "created_by"  INTEGER       NOT NULL,
    "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trips_pkey" PRIMARY KEY ("trip_id"),
    CONSTRAINT "ck_trips_name_not_blank" CHECK (length(btrim("trip_name")) > 0),
    CONSTRAINT "ck_trips_date_order"     CHECK ("end_date" >= "start_date"),
    CONSTRAINT "ck_trips_currency"       CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "ck_trips_status"         CHECK ("status" IN ('planning', 'confirmed', 'ongoing', 'completed', 'cancelled'))
);
CREATE INDEX "trips_created_by_idx" ON "trips"("created_by");

-- --------------------------------------------------------- trip_members
CREATE TABLE "trip_members" (
    "trip_id"     INTEGER       NOT NULL,
    "user_id"     INTEGER       NOT NULL,
    "member_role" VARCHAR(20)   NOT NULL DEFAULT 'member',
    "joined_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"      VARCHAR(20)   NOT NULL DEFAULT 'active',
    CONSTRAINT "trip_members_pkey" PRIMARY KEY ("trip_id", "user_id"),
    CONSTRAINT "ck_trip_members_role"   CHECK ("member_role" IN ('organizer', 'member', 'viewer')),
    CONSTRAINT "ck_trip_members_status" CHECK ("status" IN ('active', 'inactive'))
);
CREATE INDEX "trip_members_user_id_idx" ON "trip_members"("user_id");

-- --------------------------------------------------------- destinations
CREATE TABLE "destinations" (
    "destination_id" SERIAL        NOT NULL,
    "trip_id"        INTEGER       NOT NULL,
    "name"           VARCHAR(200)  NOT NULL,
    "location"       VARCHAR(300)  NOT NULL,
    "arrival_date"   DATE          NOT NULL,
    "departure_date" DATE          NOT NULL,
    "notes"          TEXT,
    CONSTRAINT "destinations_pkey" PRIMARY KEY ("destination_id"),
    CONSTRAINT "ck_destinations_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "ck_destinations_date_order"     CHECK ("departure_date" >= "arrival_date")
);
-- (trip_id, destination_id) is a candidate key used by the composite foreign
-- keys below so that a booking can only point to a destination of ITS OWN trip.
CREATE UNIQUE INDEX "destinations_trip_id_destination_id_key" ON "destinations"("trip_id", "destination_id");
CREATE INDEX "destinations_trip_id_arrival_date_idx" ON "destinations"("trip_id", "arrival_date");

-- ----------------------------------------------------------- transports
CREATE TABLE "transports" (
    "transport_id"             SERIAL         NOT NULL,
    "trip_id"                  INTEGER        NOT NULL,
    "transport_type"           VARCHAR(50)    NOT NULL,
    "provider"                 VARCHAR(200)   NOT NULL,
    "departure_destination_id" INTEGER        NOT NULL,
    "arrival_destination_id"   INTEGER        NOT NULL,
    "departure_time"           TIMESTAMP(3)   NOT NULL,
    "arrival_time"             TIMESTAMP(3)   NOT NULL,
    "booking_reference"        VARCHAR(100),
    "cost"                     DECIMAL(12,2)  NOT NULL DEFAULT 0,
    "status"                   VARCHAR(20)    NOT NULL DEFAULT 'confirmed',
    CONSTRAINT "transports_pkey" PRIMARY KEY ("transport_id"),
    CONSTRAINT "ck_transports_type"        CHECK ("transport_type" IN ('flight', 'train', 'bus', 'car', 'ferry', 'other')),
    CONSTRAINT "ck_transports_time_order"  CHECK ("arrival_time" > "departure_time"),
    CONSTRAINT "ck_transports_endpoints"   CHECK ("departure_destination_id" <> "arrival_destination_id"),
    CONSTRAINT "ck_transports_cost"        CHECK ("cost" >= 0),
    CONSTRAINT "ck_transports_status"      CHECK ("status" IN ('confirmed', 'pending', 'cancelled')),
    CONSTRAINT "ck_transports_provider_not_blank" CHECK (length(btrim("provider")) > 0)
);
CREATE UNIQUE INDEX "transports_trip_id_booking_reference_key" ON "transports"("trip_id", "booking_reference");
CREATE INDEX "transports_trip_id_departure_time_arrival_time_idx" ON "transports"("trip_id", "departure_time", "arrival_time");

-- ------------------------------------------------------- accommodations
CREATE TABLE "accommodations" (
    "accommodation_id"  SERIAL         NOT NULL,
    "trip_id"           INTEGER        NOT NULL,
    "destination_id"    INTEGER        NOT NULL,
    "name"              VARCHAR(200)   NOT NULL,
    "address"           VARCHAR(500),
    "check_in"          TIMESTAMP(3)   NOT NULL,
    "check_out"         TIMESTAMP(3)   NOT NULL,
    "booking_reference" VARCHAR(100),
    "cost"              DECIMAL(12,2)  NOT NULL DEFAULT 0,
    "status"            VARCHAR(20)    NOT NULL DEFAULT 'confirmed',
    CONSTRAINT "accommodations_pkey" PRIMARY KEY ("accommodation_id"),
    CONSTRAINT "ck_accommodations_time_order" CHECK ("check_out" > "check_in"),
    CONSTRAINT "ck_accommodations_cost"       CHECK ("cost" >= 0),
    CONSTRAINT "ck_accommodations_status"     CHECK ("status" IN ('confirmed', 'pending', 'cancelled')),
    CONSTRAINT "ck_accommodations_name_not_blank" CHECK (length(btrim("name")) > 0)
);
CREATE UNIQUE INDEX "accommodations_trip_id_booking_reference_key" ON "accommodations"("trip_id", "booking_reference");
CREATE INDEX "accommodations_trip_id_check_in_check_out_idx" ON "accommodations"("trip_id", "check_in", "check_out");

-- ------------------------------------------------------------- expenses
CREATE TABLE "expenses" (
    "expense_id"   SERIAL         NOT NULL,
    "trip_id"      INTEGER        NOT NULL,
    "paid_by"      INTEGER        NOT NULL,
    "category"     VARCHAR(50)    NOT NULL,
    "amount"       DECIMAL(12,2)  NOT NULL DEFAULT 0,
    "description"  TEXT,
    "expense_date" DATE           NOT NULL,
    "created_at"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("expense_id"),
    CONSTRAINT "ck_expenses_category" CHECK ("category" IN ('transport', 'accommodation', 'food', 'activities', 'shopping', 'other')),
    CONSTRAINT "ck_expenses_amount"   CHECK ("amount" > 0)
);
CREATE INDEX "expenses_trip_id_category_idx" ON "expenses"("trip_id", "category");
CREATE INDEX "expenses_paid_by_idx" ON "expenses"("paid_by");
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

---------------------------------------------------------- expense_splits
CREATE TABLE "expense_splits" (
    "split_id"     SERIAL         NOT NULL,
    "expense_id"   INTEGER        NOT NULL,
    "user_id"      INTEGER        NOT NULL,
    "share_amount" DECIMAL(12,2)  NOT NULL,
    "is_settled"   BOOLEAN        NOT NULL DEFAULT false,
    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("split_id"),
    CONSTRAINT "ck_expense_splits_share" CHECK ("share_amount" >= 0)
);
CREATE UNIQUE INDEX "expense_splits_expense_id_user_id_key" ON "expense_splits"("expense_id", "user_id");
CREATE INDEX "expense_splits_user_id_idx" ON "expense_splits"("user_id");

-- ------------------------------------------------------------- payments
CREATE TABLE "payments" (
    "payment_id"     SERIAL         NOT NULL,
    "expense_id"     INTEGER        NOT NULL,
    "paid_by"        INTEGER        NOT NULL,
    "amount"         DECIMAL(12,2)  NOT NULL,
    "payment_method" VARCHAR(50)    NOT NULL,
    "transaction_id" VARCHAR(100),
    "paid_at"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"         VARCHAR(20)    NOT NULL DEFAULT 'completed',
    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id"),
    CONSTRAINT "ck_payments_amount" CHECK ("amount" > 0),
    CONSTRAINT "ck_payments_method" CHECK ("payment_method" IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
    CONSTRAINT "ck_payments_status" CHECK ("status" IN ('completed', 'pending', 'failed'))
);
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");
CREATE INDEX "payments_expense_id_idx" ON "payments"("expense_id");

-- -------------------------------------------------------------- budgets
CREATE TABLE "budgets" (
    "budget_id"      SERIAL         NOT NULL,
    "trip_id"        INTEGER        NOT NULL,
    "category"       VARCHAR(50)    NOT NULL,
    "planned_amount" DECIMAL(12,2)  NOT NULL,
    "remarks"        TEXT,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("budget_id"),
    CONSTRAINT "ck_budgets_category" CHECK ("category" IN ('transport', 'accommodation', 'food', 'activities', 'shopping', 'other')),
    CONSTRAINT "ck_budgets_amount"   CHECK ("planned_amount" >= 0)
);
CREATE UNIQUE INDEX "budgets_trip_id_category_key" ON "budgets"("trip_id", "category");

-- ------------------------------------------------------ itinerary_slots
-- Time skeleton of an activity. The rich, schema-flexible description lives in
-- MongoDB and is linked through mongo_doc_id (a 24-hex ObjectId string).
CREATE TABLE "itinerary_slots" (
    "slot_id"        SERIAL        NOT NULL,
    "trip_id"        INTEGER       NOT NULL,
    "destination_id" INTEGER,
    "mongo_doc_id"   VARCHAR(24)   NOT NULL,
    "slot_type"      VARCHAR(30)   NOT NULL,
    "title"          VARCHAR(200)  NOT NULL,
    "start_time"     TIMESTAMP(3)  NOT NULL,
    "end_time"       TIMESTAMP(3)  NOT NULL,
    "is_locked"      BOOLEAN       NOT NULL DEFAULT false,
    "created_by"     INTEGER       NOT NULL,
    "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "itinerary_slots_pkey" PRIMARY KEY ("slot_id"),
    CONSTRAINT "ck_itinerary_slots_time_order" CHECK ("end_time" > "start_time"),
    CONSTRAINT "ck_itinerary_slots_type"       CHECK ("slot_type" IN ('sightseeing', 'dining', 'adventure', 'leisure', 'festival', 'custom')),
    CONSTRAINT "ck_itinerary_slots_mongo_id"   CHECK ("mongo_doc_id" ~ '^[0-9a-f]{24}$'),
    CONSTRAINT "ck_itinerary_slots_title"      CHECK (length(btrim("title")) > 0)
);
CREATE UNIQUE INDEX "itinerary_slots_mongo_doc_id_key" ON "itinerary_slots"("mongo_doc_id");
CREATE INDEX "itinerary_slots_trip_id_start_time_end_time_idx" ON "itinerary_slots"("trip_id", "start_time", "end_time");

-- ===================== FOREIGN KEYS (ALTER TABLE ... ADD CONSTRAINT) =====================
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "destinations" ADD CONSTRAINT "destinations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transports" ADD CONSTRAINT "transports_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transports" ADD CONSTRAINT "transports_trip_id_departure_destination_id_fkey" FOREIGN KEY ("trip_id", "departure_destination_id") REFERENCES "destinations"("trip_id", "destination_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transports" ADD CONSTRAINT "transports_trip_id_arrival_destination_id_fkey" FOREIGN KEY ("trip_id", "arrival_destination_id") REFERENCES "destinations"("trip_id", "destination_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accommodations" ADD CONSTRAINT "accommodations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accommodations" ADD CONSTRAINT "accommodations_trip_id_destination_id_fkey" FOREIGN KEY ("trip_id", "destination_id") REFERENCES "destinations"("trip_id", "destination_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("expense_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("expense_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_slots" ADD CONSTRAINT "itinerary_slots_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_slots" ADD CONSTRAINT "itinerary_slots_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("destination_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "itinerary_slots" ADD CONSTRAINT "itinerary_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
