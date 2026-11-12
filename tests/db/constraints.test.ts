import { afterAll, describe, expect, it } from "vitest";
import { destination, failure, hex24, member, pool, trip, user } from "./helpers";

afterAll(() => pool.end());

describe("users: validation inside the database", () => {
  it("refuses a plain-text password (only bcrypt hashes are storable)", async () => {
    const err = await failure("INSERT INTO users(name,email,password_hash) VALUES ('A','plain@t.local','hunter2hunter2')");
    expect(err).toMatch(/ck_users_password_is_bcrypt/);
  });
  it("refuses malformed or upper-case e-mail, unknown roles and bad phones", async () => {
    const h = "$2b$12$" + "a".repeat(53);
    expect(await failure("INSERT INTO users(name,email,password_hash) VALUES ('A','not-an-email',$1)", [h])).toMatch(/ck_users_email_format/);
    expect(await failure("INSERT INTO users(name,email,password_hash) VALUES ('A','UPPER@t.local',$1)", [h])).toMatch(/ck_users_email_format/);
    expect(await failure("INSERT INTO users(name,email,password_hash,role) VALUES ('A','r@t.local',$1,'root')", [h])).toMatch(/ck_users_role/);
    expect(await failure("INSERT INTO users(name,email,password_hash,phone) VALUES ('A','p@t.local',$1,'abc')", [h])).toMatch(/ck_users_phone_format/);
  });
  it("enforces unique e-mail", async () => {
    const h = "$2b$12$" + "a".repeat(53);
    await pool.query("INSERT INTO users(name,email,password_hash) VALUES ('A','dup@t.local',$1)", [h]);
    expect(await failure("INSERT INTO users(name,email,password_hash) VALUES ('B','dup@t.local',$1)", [h])).toMatch(/users_email_key/);
  });
});

describe("trips, bookings and itinerary: CHECK constraints", () => {
  it("rejects end date before start date, bad currency and status", async () => {
    const u = await user();
    expect(await failure("INSERT INTO trips(trip_name,start_date,end_date,created_by) VALUES ('x','2026-12-24','2026-12-20',$1)", [u])).toMatch(/ck_trips_date_order/);
    expect(await failure("INSERT INTO trips(trip_name,start_date,end_date,currency,created_by) VALUES ('x','2026-12-20','2026-12-24','rs',$1)", [u])).toMatch(/ck_trips_currency|value too long/);
    expect(await failure("INSERT INTO trips(trip_name,start_date,end_date,status,created_by) VALUES ('x','2026-12-20','2026-12-24','lost',$1)", [u])).toMatch(/ck_trips_status/);
  });
  it("transport: arrival after departure, distinct endpoints, non-negative cost", async () => {
    const u = await user(); const t = await trip(u);
    const a = await destination(t, "A"); const b = await destination(t, "B");
    const ins = (dep: string, arr: string, from: number, to: number, cost = 10) =>
      failure("INSERT INTO transports(trip_id,transport_type,provider,departure_destination_id,arrival_destination_id,departure_time,arrival_time,cost) VALUES ($1,'bus','P',$2,$3,$4,$5,$6)", [t, from, to, dep, arr, cost]);
    expect(await ins("2026-12-21 10:00", "2026-12-21 09:00", a, b)).toMatch(/ck_transports_time_order/);
    expect(await ins("2026-12-21 10:00", "2026-12-21 12:00", a, a)).toMatch(/ck_transports_endpoints/);
    expect(await ins("2026-12-21 10:00", "2026-12-21 12:00", a, b, -1)).toMatch(/ck_transports_cost/);
    expect(await ins("2026-12-21 10:00", "2026-12-21 12:00", a, b)).toBeNull();
  });
  it("composite foreign key: a booking cannot point at another trip's destination", async () => {
    const u = await user(); const t1 = await trip(u); const t2 = await trip(u);
    const own = await destination(t1, "Own"); const own2 = await destination(t1, "Own2"); const foreign = await destination(t2, "Foreign");
    const err = await failure("INSERT INTO transports(trip_id,transport_type,provider,departure_destination_id,arrival_destination_id,departure_time,arrival_time) VALUES ($1,'bus','P',$2,$3,'2026-12-21 10:00','2026-12-21 12:00')", [t1, own, foreign]);
    expect(err).toMatch(/foreign key/i);
    expect(await failure("INSERT INTO accommodations(trip_id,destination_id,name,check_in,check_out) VALUES ($1,$2,'H','2026-12-21 10:00','2026-12-22 10:00')", [t1, foreign])).toMatch(/foreign key/i);
    expect(own2).toBeGreaterThan(0);
  });
  it("itinerary slot: end after start, valid type, valid ObjectId", async () => {
    const u = await user(); const t = await trip(u);
    const ins = (type: string, s: string, e: string, id = hex24()) =>
      failure("INSERT INTO itinerary_slots(trip_id,mongo_doc_id,slot_type,title,start_time,end_time,created_by) VALUES ($1,$2,$3,'x',$4,$5,$6)", [t, id, type, s, e, u]);
    expect(await ins("sightseeing", "2026-12-21 11:00", "2026-12-21 10:00")).toMatch(/ck_itinerary_slots_time_order/);
    expect(await ins("rave", "2026-12-21 10:00", "2026-12-21 11:00")).toMatch(/ck_itinerary_slots_type/);
    expect(await ins("sightseeing", "2026-12-21 10:00", "2026-12-21 11:00", "NOT-AN-OBJECT-ID")).toMatch(/ck_itinerary_slots_mongo_id|value too long/);
    expect(await ins("sightseeing", "2026-12-21 10:00", "2026-12-21 11:00")).toBeNull();
  });
  it("budget unique per (trip, category) and non-negative; expense amount > 0", async () => {
    const u = await user(); const t = await trip(u);
    await pool.query("INSERT INTO budgets(trip_id,category,planned_amount) VALUES ($1,'food',100)", [t]);
    expect(await failure("INSERT INTO budgets(trip_id,category,planned_amount) VALUES ($1,'food',200)", [t])).toMatch(/budgets_trip_id_category_key/);
    expect(await failure("INSERT INTO budgets(trip_id,category,planned_amount) VALUES ($1,'shopping',-1)", [t])).toMatch(/ck_budgets_amount/);
    expect(await failure("INSERT INTO expenses(trip_id,paid_by,category,amount,expense_date) VALUES ($1,$2,'food',0,'2026-12-21')", [t, u])).toMatch(/ck_expenses_amount/);
  });
});

describe("trigger: everything must fall inside the trip dates", () => {
  it("rejects an activity outside the trip window with TS_OUTSIDE_TRIP_WINDOW", async () => {
    const u = await user(); const t = await trip(u, "2026-12-20", "2026-12-24");
    const ins = (s: string, e: string) => failure("INSERT INTO itinerary_slots(trip_id,mongo_doc_id,slot_type,title,start_time,end_time,created_by) VALUES ($1,$2,'leisure','x',$3,$4,$5)", [t, hex24(), s, e, u]);
    expect(await ins("2026-12-19 23:00", "2026-12-20 01:00")).toMatch(/TS_OUTSIDE_TRIP_WINDOW/);
    expect(await ins("2026-12-24 23:00", "2026-12-25 01:00")).toMatch(/TS_OUTSIDE_TRIP_WINDOW/);
    expect(await ins("2026-12-20 00:00", "2026-12-24 23:59")).toBeNull(); // the full window is allowed
  });
  it("applies to destinations, transports and stays as well", async () => {
    const u = await user(); const t = await trip(u, "2026-12-20", "2026-12-24");
    expect(await failure("INSERT INTO destinations(trip_id,name,location,arrival_date,departure_date) VALUES ($1,'x','x','2026-12-19','2026-12-21')", [t])).toMatch(/TS_OUTSIDE_TRIP_WINDOW/);
    const a = await destination(t, "A"); const b = await destination(t, "B");
    expect(await failure("INSERT INTO transports(trip_id,transport_type,provider,departure_destination_id,arrival_destination_id,departure_time,arrival_time) VALUES ($1,'bus','P',$2,$3,'2026-12-24 22:00','2026-12-25 05:00')", [t, a, b])).toMatch(/TS_OUTSIDE_TRIP_WINDOW/);
    expect(await failure("INSERT INTO accommodations(trip_id,destination_id,name,check_in,check_out) VALUES ($1,$2,'H','2026-12-19 12:00','2026-12-21 10:00')", [t, a])).toMatch(/TS_OUTSIDE_TRIP_WINDOW/);
  });
  it("blocks shrinking a trip around scheduled items, allows harmless changes", async () => {
    const u = await user(); const t = await trip(u, "2026-12-20", "2026-12-24");
    await pool.query("INSERT INTO itinerary_slots(trip_id,mongo_doc_id,slot_type,title,start_time,end_time,created_by) VALUES ($1,$2,'leisure','x','2026-12-23 10:00','2026-12-23 11:00',$3)", [t, hex24(), u]);
    expect(await failure("UPDATE trips SET end_date='2026-12-22' WHERE trip_id=$1", [t])).toMatch(/TS_TRIP_SHRINK/);
    expect(await failure("UPDATE trips SET end_date='2026-12-30' WHERE trip_id=$1", [t])).toBeNull();
    expect(await failure("UPDATE trips SET trip_name='renamed' WHERE trip_id=$1", [t])).toBeNull();
  });
  it("an activity's destination must belong to the same trip", async () => {
    const u = await user(); const t1 = await trip(u); const t2 = await trip(u);
    const foreign = await destination(t2);
    expect(await failure("INSERT INTO itinerary_slots(trip_id,destination_id,mongo_doc_id,slot_type,title,start_time,end_time,created_by) VALUES ($1,$2,$3,'leisure','x','2026-12-21 10:00','2026-12-21 11:00',$4)", [t1, foreign, hex24(), u])).toMatch(/TS_DESTINATION_TRIP_MISMATCH/);
  });
});

describe("trigger: a trip always keeps an organizer", () => {
  it("blocks deleting or demoting the last organizer", async () => {
    const u = await user(); const t = await trip(u);
    expect(await failure("DELETE FROM trip_members WHERE trip_id=$1 AND user_id=$2", [t, u])).toMatch(/TS_LAST_ORGANIZER/);
    expect(await failure("UPDATE trip_members SET member_role='member' WHERE trip_id=$1 AND user_id=$2", [t, u])).toMatch(/TS_LAST_ORGANIZER/);
    expect(await failure("UPDATE trip_members SET status='inactive' WHERE trip_id=$1 AND user_id=$2", [t, u])).toMatch(/TS_LAST_ORGANIZER/);
  });
  it("allows it once another organizer exists, and still allows deleting the whole trip", async () => {
    const u1 = await user(); const u2 = await user(); const t = await trip(u1);
    await member(t, u2, "organizer");
    expect(await failure("DELETE FROM trip_members WHERE trip_id=$1 AND user_id=$2", [t, u1])).toBeNull();
    expect(await failure("DELETE FROM trips WHERE trip_id=$1", [t])).toBeNull(); // cascade passes the guard
    const { rows } = await pool.query("SELECT 1 FROM trip_members WHERE trip_id=$1", [t]);
    expect(rows).toHaveLength(0);
  });
});

describe("ON DELETE CASCADE", () => {
  it("deleting a trip removes all of its dependent rows (no orphans)", async () => {
    const u = await user(); const t = await trip(u);
    const a = await destination(t, "A");
    await pool.query("INSERT INTO budgets(trip_id,category,planned_amount) VALUES ($1,'food',10)", [t]);
    await pool.query("INSERT INTO itinerary_slots(trip_id,destination_id,mongo_doc_id,slot_type,title,start_time,end_time,created_by) VALUES ($1,$2,$3,'leisure','x','2026-12-21 10:00','2026-12-21 11:00',$4)", [t, a, hex24(), u]);
    const e = await pool.query("INSERT INTO expenses(trip_id,paid_by,category,amount,expense_date) VALUES ($1,$2,'food',10,'2026-12-21') RETURNING expense_id", [t, u]);
    await pool.query("INSERT INTO expense_splits(expense_id,user_id,share_amount) VALUES ($1,$2,10)", [e.rows[0].expense_id, u]);
    await pool.query("DELETE FROM trips WHERE trip_id=$1", [t]);
    for (const tbl of ["destinations", "budgets", "itinerary_slots", "expenses", "trip_members"]) {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tbl} WHERE trip_id=$1`, [t]);
      expect(rows[0].n, tbl).toBe(0);
    }
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM expense_splits WHERE expense_id=$1", [e.rows[0].expense_id]);
    expect(rows[0].n).toBe(0);
  });
  it("a destination that is still referenced by a booking cannot be deleted (RESTRICT)", async () => {
    const u = await user(); const t = await trip(u); const a = await destination(t, "A"); const b = await destination(t, "B");
    await pool.query("INSERT INTO transports(trip_id,transport_type,provider,departure_destination_id,arrival_destination_id,departure_time,arrival_time) VALUES ($1,'bus','P',$2,$3,'2026-12-21 10:00','2026-12-21 12:00')", [t, a, b]);
    expect(await failure("DELETE FROM destinations WHERE destination_id=$1", [a])).toMatch(/foreign key/i);
  });
});
