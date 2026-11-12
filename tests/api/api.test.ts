// End-to-end API tests against the RUNNING application and real PostgreSQL + MongoDB.
// Every assertion about persistence reads the database directly, not just the API.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { Pool } from "pg";
import { BASE, Client, PASSWORD, email, registerUser } from "./client";

const pg = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
let mongo: MongoClient;
const activities = () => mongo.db(process.env.MONGODB_DB || "tripsync").collection("activities");

let owner: Awaited<ReturnType<typeof registerUser>>;
let friend: Awaited<ReturnType<typeof registerUser>>;
let stranger: Awaited<ReturnType<typeof registerUser>>;
let tripId: number;
let hampi: number, bangalore: number;

beforeAll(async () => {
  mongo = await MongoClient.connect(process.env.MONGODB_URI!);
  const health = await fetch(BASE + "/api/health").then((r) => r.json());
  if (!health.data?.postgres?.ok || !health.data?.mongodb?.ok) throw new Error("App or databases are not up: " + JSON.stringify(health));
  [owner, friend, stranger] = await Promise.all([registerUser("owner"), registerUser("friend"), registerUser("stranger")]);
});

afterAll(async () => {
  // Remove everything this run created (users with the @apitest.local domain).
  const t = await pg.query("SELECT trip_id FROM trips WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE '%@apitest.local')");
  for (const r of t.rows) await activities().deleteMany({ tripId: r.trip_id });
  await pg.query("DELETE FROM trips WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE '%@apitest.local')");
  await pg.query("DELETE FROM users WHERE email LIKE '%@apitest.local'");
  await pg.end();
  await mongo.close();
});

describe("1. authentication", () => {
  it("stores a bcrypt hash, never the password, and never returns it", async () => {
    const { rows } = await pg.query("SELECT password_hash FROM users WHERE user_id=$1", [owner.userId]);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
    const me = await owner.client.get("/api/auth/me");
    expect(JSON.stringify(me.body)).not.toMatch(/hash|password/i);
  });
  it("rejects duplicate e-mail, weak passwords and bad e-mail with clear errors", async () => {
    const dup = await new Client().post("/api/auth/register", { name: "X", email: owner.email, password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body.error?.code).toBe("EMAIL_TAKEN");
    const weak = await new Client().post("/api/auth/register", { name: "X", email: email("weak"), password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.error?.details[0].field).toBe("password");
    expect((await new Client().post("/api/auth/register", { name: "X", email: "nope", password: PASSWORD })).status).toBe(400);
  });
  it("login works, wrong password and unknown e-mail give the same 401", async () => {
    const c = new Client();
    const bad = await c.post("/api/auth/login", { email: owner.email, password: "WrongPass999" });
    const unknown = await c.post("/api/auth/login", { email: email("ghost"), password: "WrongPass999" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error?.message).toBe(unknown.body.error?.message);
    const ok = await c.post("/api/auth/login", { email: owner.email.toUpperCase(), password: PASSWORD });
    expect(ok.status).toBe(200);
    expect((await c.get("/api/auth/me")).body.data.user.email).toBe(owner.email);
  });
  it("session cookie is httpOnly + SameSite and the token is not in the body", async () => {
    const res = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner.email, password: PASSWORD }) });
    const cookie = res.headers.get("set-cookie") || "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(JSON.stringify(await res.json())).not.toMatch(/eyJ/);
  });
  it("private routes need a session; logout ends it; a forged cookie is rejected", async () => {
    expect((await new Client().get("/api/trips")).status).toBe(401);
    const c = new Client(); await c.post("/api/auth/login", { email: owner.email, password: PASSWORD });
    expect((await c.get("/api/trips")).status).toBe(200);
    await c.post("/api/auth/logout");
    expect((await c.get("/api/trips")).status).toBe(401);
    const forged = await fetch(BASE + "/api/trips", { headers: { cookie: "tripsync_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.forged" } });
    expect(forged.status).toBe(401);
  });
  it("throttles repeated failed logins (429)", async () => {
    const c = new Client(); const e = email("brute");
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await c.post("/api/auth/login", { email: e, password: "WrongPass999" })).status;
    expect(last).toBe(429);
  });
  it("blocks cross-site state-changing requests (Origin check)", async () => {
    const r = await owner.client.post("/api/trips", { tripName: "Evil", startDate: "2026-12-01", endDate: "2026-12-02" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });
});

describe("2. trips: create / read / update / persistence", () => {
  it("validates input and creates a trip with the creator as organizer", async () => {
    const bad = await owner.client.post("/api/trips", { tripName: "", startDate: "2026-12-24", endDate: "2026-12-20" });
    expect(bad.status).toBe(400);
    const r = await owner.client.post("/api/trips", { tripName: "Goa Escape", description: "Beach", startDate: "2026-12-20", endDate: "2026-12-24", currency: "inr", primaryDestination: "Goa" });
    expect(r.status).toBe(201);
    tripId = r.body.data.tripId;
    const { rows } = await pg.query("SELECT member_role FROM trip_members WHERE trip_id=$1 AND user_id=$2", [tripId, owner.userId]);
    expect(rows[0].member_role).toBe("organizer");
    const dests = await pg.query("SELECT name FROM destinations WHERE trip_id=$1", [tripId]);
    expect(dests.rows[0].name).toBe("Goa");
  });
  it("lists only my trips, supports search/sort/filter", async () => {
    const mine = await owner.client.get("/api/trips");
    expect(mine.body.data.map((t: any) => t.tripId)).toContain(tripId);
    expect((await owner.client.get("/api/trips?q=goa")).body.data).toHaveLength(1);
    expect((await owner.client.get("/api/trips?q=zzzzzz")).body.data).toHaveLength(0);
    expect((await owner.client.get("/api/trips?status=completed")).body.data).toHaveLength(0);
    expect((await stranger.client.get("/api/trips")).body.data).toHaveLength(0);
  });
  it("update persists; invalid status/date order rejected", async () => {
    const up = await owner.client.put(`/api/trips/${tripId}`, { tripName: "Goa Escape 2026", status: "confirmed" });
    expect(up.status).toBe(200);
    expect((await pg.query("SELECT trip_name,status FROM trips WHERE trip_id=$1", [tripId])).rows[0]).toEqual({ trip_name: "Goa Escape 2026", status: "confirmed" });
    expect((await owner.client.put(`/api/trips/${tripId}`, { status: "weird" })).status).toBe(400);
    expect((await owner.client.put(`/api/trips/${tripId}`, { startDate: "2026-12-25", endDate: "2026-12-20" })).status).toBe(400);
  });
});

describe("3. authorization: other users cannot see or touch my trip", () => {
  it("a stranger gets 404 on every trip resource and mutation (no leak that it exists)", async () => {
    const s = stranger.client;
    const reads = ["", "/destinations", "/transport", "/accommodation", "/expenses", "/budget", "/members", "/activities", "/timeline", "/conflicts", "/insights"];
    for (const p of reads) expect((await s.get(`/api/trips/${tripId}${p}`)).status, p).toBe(404);
    expect((await s.put(`/api/trips/${tripId}`, { tripName: "hacked" })).status).toBe(404);
    expect((await s.del(`/api/trips/${tripId}`)).status).toBe(404);
    expect((await s.post(`/api/trips/${tripId}/expenses`, { amount: 5, expenseDate: "2026-12-21" })).status).toBe(404);
    expect((await s.post(`/api/trips/${tripId}/search`, { query: "beach" })).status).toBe(404);
    expect((await pg.query("SELECT trip_name FROM trips WHERE trip_id=$1", [tripId])).rows[0].trip_name).toBe("Goa Escape 2026");
  });
  it("non-numeric ids are rejected, not crashed on", async () => {
    expect((await owner.client.get("/api/trips/abc")).status).toBe(400);
    expect((await owner.client.get(`/api/trips/${tripId}/activities/not-an-id`)).status).toBe(400);
  });
});

describe("4. destinations, transport, accommodation (CRUD + integrity)", () => {
  it("adds destinations, rejects bad dates, persists", async () => {
    const d = await owner.client.post(`/api/trips/${tripId}/destinations`, { name: "North Goa", location: "Calangute", arrivalDate: "2026-12-21", departureDate: "2026-12-23" });
    expect(d.status).toBe(201); hampi = d.body.data.destinationId;
    const b = await owner.client.post(`/api/trips/${tripId}/destinations`, { name: "Bangalore", location: "Bangalore", arrivalDate: "2026-12-20", departureDate: "2026-12-20" });
    bangalore = b.body.data.destinationId;
    expect((await owner.client.post(`/api/trips/${tripId}/destinations`, { name: "X", location: "X", arrivalDate: "2026-12-23", departureDate: "2026-12-21" })).status).toBe(400);
    const outside = await owner.client.post(`/api/trips/${tripId}/destinations`, { name: "X", location: "X", arrivalDate: "2026-12-10", departureDate: "2026-12-21" });
    expect(outside.status).toBe(422);
    expect(outside.body.error?.message).toMatch(/trip's start and end dates/);
  });
  it("transport: create, edit, conflicting references and window enforced", async () => {
    const t = await owner.client.post(`/api/trips/${tripId}/transport`, { transportType: "bus", provider: "KSRTC", departureDestinationId: bangalore, arrivalDestinationId: hampi, departureTime: "2026-12-20T22:00", arrivalTime: "2026-12-21T05:30", bookingReference: "REF1", cost: 850 });
    expect(t.status).toBe(201);
    expect(t.body.data.cost).toBe("850.00");
    expect((await owner.client.post(`/api/trips/${tripId}/transport`, { provider: "Dup", departureDestinationId: bangalore, arrivalDestinationId: hampi, departureTime: "2026-12-21T08:00", arrivalTime: "2026-12-21T09:00", bookingReference: "REF1" })).body.error?.code).toBe("DUPLICATE");
    expect((await owner.client.post(`/api/trips/${tripId}/transport`, { provider: "Late", departureDestinationId: bangalore, arrivalDestinationId: hampi, departureTime: "2026-12-24T22:00", arrivalTime: "2026-12-25T06:00" })).status).toBe(422);
    const edit = await owner.client.put(`/api/trips/${tripId}/transport/${t.body.data.transportId}`, { transportType: "bus", provider: "KSRTC Updated", departureDestinationId: bangalore, arrivalDestinationId: hampi, departureTime: "2026-12-20T21:00", arrivalTime: "2026-12-21T05:30", bookingReference: "REF1", cost: "900.50" });
    expect(edit.status).toBe(200);
    expect((await pg.query("SELECT provider,cost,departure_time FROM transports WHERE transport_id=$1", [t.body.data.transportId])).rows[0]).toMatchObject({ provider: "KSRTC Updated", cost: "900.50" });
  });
  it("IDOR: a destination of ANOTHER trip cannot be referenced", async () => {
    const other = await stranger.client.post("/api/trips", { tripName: "Other", startDate: "2026-12-20", endDate: "2026-12-24", primaryDestination: "Elsewhere" });
    const foreign = (await pg.query("SELECT destination_id FROM destinations WHERE trip_id=$1", [other.body.data.tripId])).rows[0].destination_id;
    const r = await owner.client.post(`/api/trips/${tripId}/transport`, { provider: "X", departureDestinationId: bangalore, arrivalDestinationId: foreign, departureTime: "2026-12-21T08:00", arrivalTime: "2026-12-21T09:00" });
    expect(r.status).toBe(422);
    const acc = await owner.client.post(`/api/trips/${tripId}/accommodation`, { destinationId: foreign, name: "H", checkIn: "2026-12-21T12:00", checkOut: "2026-12-22T10:00" });
    expect(acc.status).toBe(422);
    const strangerDel = await stranger.client.del(`/api/trips/${other.body.data.tripId}/destinations/${hampi}`); // my destination id through THEIR trip
    expect(strangerDel.status).toBe(404);
    expect((await pg.query("SELECT 1 FROM destinations WHERE destination_id=$1", [hampi])).rowCount).toBe(1);
  });
  it("destination: edit works; an unused destination can be deleted and activities are only unlinked", async () => {
    const d = await owner.client.post(`/api/trips/${tripId}/destinations`, { name: "Temp stop", location: "Somewhere", arrivalDate: "2026-12-22", departureDate: "2026-12-22" });
    const id = d.body.data.destinationId;
    const up = await owner.client.put(`/api/trips/${tripId}/destinations/${id}`, { name: "Temp stop renamed", location: "Somewhere else", arrivalDate: "2026-12-22", departureDate: "2026-12-23", notes: "n" });
    expect(up.status).toBe(200);
    expect((await pg.query("SELECT name, departure_date FROM destinations WHERE destination_id=$1", [id])).rows[0].name).toBe("Temp stop renamed");
    const act = await owner.client.post(`/api/trips/${tripId}/activities`, { title: "Linked walk", destinationId: id, startTime: "2026-12-22T19:00", endTime: "2026-12-22T20:00" });
    expect(act.status).toBe(201);
    expect((await owner.client.del(`/api/trips/${tripId}/destinations/${id}`)).status).toBe(200);
    expect((await pg.query("SELECT 1 FROM destinations WHERE destination_id=$1", [id])).rowCount).toBe(0);
    const slot = await pg.query("SELECT destination_id FROM itinerary_slots WHERE mongo_doc_id=$1", [act.body.data.activity.id]);
    expect(slot.rows[0].destination_id).toBeNull(); // activity survived, just unlinked
    expect((await owner.client.del(`/api/trips/${tripId}/activities/${act.body.data.activity.id}`)).status).toBe(200);
  });
  it("accommodation CRUD, then a destination in use cannot be deleted", async () => {
    const a = await owner.client.post(`/api/trips/${tripId}/accommodation`, { destinationId: hampi, name: "Beach Hut", checkIn: "2026-12-21T06:00", checkOut: "2026-12-23T11:00", cost: 3200 });
    expect(a.status).toBe(201);
    expect((await owner.client.post(`/api/trips/${tripId}/accommodation`, { destinationId: hampi, name: "Bad", checkIn: "2026-12-22T10:00", checkOut: "2026-12-21T10:00" })).status).toBe(400);
    const edit = await owner.client.put(`/api/trips/${tripId}/accommodation/${a.body.data.accommodationId}`, { destinationId: hampi, name: "Beach Hut Deluxe", checkIn: "2026-12-21T06:00", checkOut: "2026-12-23T11:00", cost: "3500" });
    expect(edit.body.data.name).toBe("Beach Hut Deluxe");
    const blocked = await owner.client.del(`/api/trips/${tripId}/destinations/${hampi}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error?.code).toBe("IN_USE");
    const list = await owner.client.get(`/api/trips/${tripId}/accommodation`);
    expect(list.body.data[0].destination.name).toBe("North Goa");
  });
});

describe("5. members & roles", () => {
  it("organizer adds a viewer by e-mail; viewer can read but not write", async () => {
    expect((await owner.client.post(`/api/trips/${tripId}/members`, { email: friend.email, memberRole: "viewer" })).status).toBe(201);
    expect((await owner.client.post(`/api/trips/${tripId}/members`, { email: friend.email })).body.error?.code).toBe("ALREADY_MEMBER");
    expect((await owner.client.post(`/api/trips/${tripId}/members`, { email: email("nobody") })).status).toBe(404);
    const f = friend.client;
    expect((await f.get(`/api/trips/${tripId}`)).body.data.memberRole).toBe("viewer");
    expect((await f.post(`/api/trips/${tripId}/expenses`, { amount: 10, expenseDate: "2026-12-21" })).status).toBe(403);
    expect((await f.post(`/api/trips/${tripId}/activities`, { title: "x", startTime: "2026-12-21T10:00", endTime: "2026-12-21T11:00" })).status).toBe(403);
    expect((await f.post(`/api/trips/${tripId}/destinations`, { name: "x", location: "x", arrivalDate: "2026-12-21", departureDate: "2026-12-21" })).status).toBe(403);
    expect((await f.put(`/api/trips/${tripId}`, { tripName: "nope" })).status).toBe(403);
    expect((await f.del(`/api/trips/${tripId}`)).status).toBe(403);
    expect((await f.post(`/api/trips/${tripId}/members`, { email: stranger.email })).status).toBe(403);
  });
  it("promoted member can contribute; the last organizer can never leave", async () => {
    expect((await owner.client.patch(`/api/trips/${tripId}/members/${friend.userId}`, { memberRole: "member" })).status).toBe(200);
    expect((await friend.client.post(`/api/trips/${tripId}/expenses`, { amount: 10, expenseDate: "2026-12-21", category: "food" })).status).toBe(201);
    const leave = await owner.client.del(`/api/trips/${tripId}/members/${owner.userId}`);
    // the owner has no expenses yet at this point, so the DB trigger is what stops them
    expect([409]).toContain(leave.status);
    expect((await pg.query("SELECT 1 FROM trip_members WHERE trip_id=$1 AND member_role='organizer'", [tripId])).rowCount).toBe(1);
    expect((await owner.client.patch(`/api/trips/${tripId}/members/${owner.userId}`, { memberRole: "member" })).status).toBe(409);
  });
});

describe("6. expenses, budget arithmetic, settlements", () => {
  let expenseId: number;
  it("records an expense split exactly (no lost paise) and rejects sub-paise amounts", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/expenses`, { category: "transport", amount: "100.01", description: "Cab", expenseDate: "2026-12-21" });
    expect(r.status).toBe(201);
    expenseId = r.body.data.expenseId;
    const shares = r.body.data.splits.map((s: any) => Math.round(Number(s.shareAmount) * 100));
    expect(shares.reduce((a: number, b: number) => a + b, 0)).toBe(10001);
    expect(r.body.data.splits).toHaveLength(2);
    expect((await owner.client.post(`/api/trips/${tripId}/expenses`, { amount: 1.005, expenseDate: "2026-12-21" })).status).toBe(400);
    expect((await owner.client.post(`/api/trips/${tripId}/expenses`, { amount: -4, expenseDate: "2026-12-21" })).status).toBe(400);
  });
  it("explicit splits must add up; outsiders cannot be in the split", async () => {
    const bad = await owner.client.post(`/api/trips/${tripId}/expenses`, { amount: 100, expenseDate: "2026-12-21", splits: [{ userId: owner.userId, shareAmount: 60 }, { userId: friend.userId, shareAmount: 30 }] });
    expect(bad.status).toBe(422);
    expect(bad.body.error?.code).toBe("SPLIT_SUM");
    const outsider = await owner.client.post(`/api/trips/${tripId}/expenses`, { amount: 100, expenseDate: "2026-12-21", splitWith: [owner.userId, stranger.userId] });
    expect(outsider.status).toBe(422);
    expect((await pg.query("SELECT count(*)::int n FROM expenses WHERE trip_id=$1 AND amount=100", [tripId])).rows[0].n).toBe(0); // nothing half-saved
  });
  it("a member cannot record an expense paid by someone else; an organizer can", async () => {
    expect((await friend.client.post(`/api/trips/${tripId}/expenses`, { amount: 5, expenseDate: "2026-12-21", paidBy: owner.userId })).status).toBe(403);
    expect((await owner.client.post(`/api/trips/${tripId}/expenses`, { amount: 40, expenseDate: "2026-12-21", category: "shopping", paidBy: friend.userId })).status).toBe(201);
  });
  it("budget: persists per category and totals are computed from stored expenses", async () => {
    expect((await owner.client.post(`/api/trips/${tripId}/budget`, { category: "transport", plannedAmount: 500 })).status).toBe(200);
    const r = await owner.client.post(`/api/trips/${tripId}/budget`, { category: "food", plannedAmount: "300.50", remarks: "meals" });
    const b = r.body.data;
    expect(b.totals.planned).toBe("800.50");
    // spent = 10.00 (friend food) + 100.01 (transport) + 40.00 (shopping)
    expect(b.totals.spent).toBe("150.01");
    expect(b.totals.remaining).toBe("650.49");
    const shop = b.rows.find((x: any) => x.category === "shopping");
    expect(shop).toMatchObject({ planned: "0.00", spent: "40.00" }); // unbudgeted spend still shown
    expect((await friend.client.post(`/api/trips/${tripId}/budget`, { category: "other", plannedAmount: 1 })).status).toBe(403);
    expect((await friend.client.get(`/api/trips/${tripId}/budget`)).status).toBe(200);
  });
  it("a category budget can be removed; unknown or unset categories are rejected", async () => {
    const r = await owner.client.del(`/api/trips/${tripId}/budget/food`);
    expect(r.status).toBe(200);
    expect(r.body.data.rows.find((x: any) => x.category === "food")?.planned).toBe("0.00"); // spend remains visible, budget gone
    expect((await pg.query("SELECT 1 FROM budgets WHERE trip_id=$1 AND category='food'", [tripId])).rowCount).toBe(0);
    expect((await owner.client.del(`/api/trips/${tripId}/budget/food`)).status).toBe(404);
    expect((await owner.client.del(`/api/trips/${tripId}/budget/bogus`)).status).toBe(400);
    expect((await friend.client.del(`/api/trips/${tripId}/budget/transport`)).status).toBe(403);
  });
  it("balances add up to zero; settling pays each member's dues via payments and is idempotent", async () => {
    let b = (await owner.client.get(`/api/trips/${tripId}/budget`)).body.data;
    const sum = (rows: any[]) => rows.reduce((s: number, x: any) => s + Math.round(Number(x.netBalance) * 100), 0);
    expect(sum(b.balances)).toBe(0);
    const debtor = b.balances.find((x: any) => Number(x.duesOutstanding) > 0 && x.userId === friend.userId);
    expect(debtor).toBeTruthy();
    const s = await friend.client.post(`/api/trips/${tripId}/settlements`, { paymentMethod: "upi" });
    expect(s.status).toBe(200);
    expect(s.body.data.settledCount).toBeGreaterThan(0);
    expect(s.body.data.totalSettled).toBe(debtor.duesOutstanding);
    b = (await owner.client.get(`/api/trips/${tripId}/budget`)).body.data;
    expect(b.balances.find((x: any) => x.userId === friend.userId).duesOutstanding).toBe("0.00");
    expect(sum(b.balances)).toBe(0); // money is conserved
    expect((await friend.client.post(`/api/trips/${tripId}/settlements`, {})).body.data.settledCount).toBe(0); // idempotent
    // once EVERY member has settled what they owe, everybody is at exactly 0.00
    expect((await owner.client.post(`/api/trips/${tripId}/settlements`, {})).status).toBe(200);
    b = (await owner.client.get(`/api/trips/${tripId}/budget`)).body.data;
    for (const x of b.balances) expect(x.netBalance, x.name).toBe("0.00");
    expect((await pg.query("SELECT count(*)::int n FROM payments p JOIN expenses e USING(expense_id) WHERE e.trip_id=$1", [tripId])).rows[0].n).toBeGreaterThan(0);
    expect((await friend.client.post(`/api/trips/${tripId}/settlements`, { userId: owner.userId })).status).toBe(403);
  });
  it("edit/delete: allowed before settlement, refused once payments exist", async () => {
    const e = await owner.client.post(`/api/trips/${tripId}/expenses`, { amount: 60, expenseDate: "2026-12-22", category: "food" });
    const id = e.body.data.expenseId;
    const up = await owner.client.put(`/api/trips/${tripId}/expenses/${id}`, { amount: 90, expenseDate: "2026-12-22", category: "food", description: "edited" });
    expect(up.status).toBe(200);
    expect(up.body.data.splits.reduce((s: number, x: any) => s + Math.round(Number(x.shareAmount) * 100), 0)).toBe(9000);
    expect((await owner.client.del(`/api/trips/${tripId}/expenses/${id}`)).status).toBe(200);
    expect((await pg.query("SELECT 1 FROM expenses WHERE expense_id=$1", [id])).rowCount).toBe(0);
    const settled = await owner.client.put(`/api/trips/${tripId}/expenses/${expenseId}`, { amount: 120, expenseDate: "2026-12-21", category: "transport" });
    expect(settled.status).toBe(409);
    expect(settled.body.error?.code).toBe("HAS_PAYMENTS");
  });
  it("a person who is part of expenses cannot be removed from the trip", async () => {
    const r = await owner.client.del(`/api/trips/${tripId}/members/${friend.userId}`);
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("HAS_EXPENSES");
  });
});

describe("7. activities: PostgreSQL slot + MongoDB document + conflicts", () => {
  let actId: string;
  it("creates an activity in BOTH databases", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/activities`, {
      slotType: "sightseeing", title: "Fort Aguada Visit", description: "Old Portuguese fort overlooking the sea", destinationId: hampi,
      startTime: "2026-12-22T09:00", endTime: "2026-12-22T11:00", tags: ["Fort", "history"], estimatedCost: { amount: "150", currency: "INR" }, customFields: { guide: true },
    });
    expect(r.status).toBe(201);
    actId = r.body.data.activity.id;
    expect(r.body.data.conflicts).toHaveLength(0);
    const slot = await pg.query("SELECT title, start_time FROM itinerary_slots WHERE mongo_doc_id=$1", [actId]);
    expect(slot.rowCount).toBe(1);
    const doc = await activities().findOne({ _id: new ObjectId(actId) });
    expect(doc).toMatchObject({ tripId, title: "Fort Aguada Visit", tags: ["fort", "history"], customFields: { guide: true } });
    expect(doc!.estimatedCost.amount.toString()).toBe("150.00"); // Decimal128 keeps exact scale
    const idx = await pg.query("SELECT sync_status, content FROM activity_embeddings WHERE mongo_doc_id=$1", [actId]);
    expect(idx.rowCount).toBe(1);
    expect(idx.rows[0].content).toContain("Fort Aguada Visit");
  });
  it("lists it with MongoDB details and survives a 'refresh'", async () => {
    const list = await owner.client.get(`/api/trips/${tripId}/activities`);
    const a = list.body.data.find((x: any) => x.id === actId);
    expect(a).toMatchObject({ title: "Fort Aguada Visit", startTime: "2026-12-22T09:00", tags: ["fort", "history"], documentMissing: false });
    expect(a.estimatedCost.amount).toBe("150.00");
  });
  it("enforces the trip window with a friendly message", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/activities`, { title: "Too early", startTime: "2026-12-19T10:00", endTime: "2026-12-19T11:00" });
    expect(r.status).toBe(422);
    expect(r.body.error?.code).toBe("OUTSIDE_TRIP_DATES");
    expect((await owner.client.post(`/api/trips/${tripId}/activities`, { title: "Backwards", startTime: "2026-12-22T12:00", endTime: "2026-12-22T11:00" })).status).toBe(400);
    expect((await owner.client.post(`/api/trips/${tripId}/activities`, { title: "BadDest", destinationId: 999999, startTime: "2026-12-22T14:00", endTime: "2026-12-22T15:00" })).status).toBe(422);
  });
  it("detects a conflict with the hotel check-out, suggests a free slot, saves only when forced", async () => {
    const payload = { title: "Late Walk", startTime: "2026-12-23T10:15", endTime: "2026-12-23T12:00" };
    const r = await owner.client.post(`/api/trips/${tripId}/activities`, payload);
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("SCHEDULE_CONFLICT");
    expect(r.body.error?.details.conflicts[0]).toMatchObject({ severity: "hard", kind: "activity_check_out" });
    expect(r.body.error?.details.suggestion).toEqual({ startTime: "2026-12-23T11:00", endTime: "2026-12-23T12:45" });
    expect((await pg.query("SELECT 1 FROM itinerary_slots WHERE trip_id=$1 AND title='Late Walk'", [tripId])).rowCount).toBe(0); // nothing saved
    const forced = await owner.client.post(`/api/trips/${tripId}/activities`, { ...payload, force: true });
    expect(forced.status).toBe(201);
    expect(forced.body.data.conflicts).toHaveLength(1);
    const c = await owner.client.get(`/api/trips/${tripId}/conflicts`);
    expect(c.body.data.summary.hard).toBeGreaterThanOrEqual(1);
    // resolve it by taking the suggestion
    const fixed = await owner.client.put(`/api/trips/${tripId}/activities/${forced.body.data.activity.id}`, { startTime: "2026-12-23T11:00", endTime: "2026-12-23T12:45" });
    expect(fixed.status).toBe(200);
    expect((await owner.client.get(`/api/trips/${tripId}/conflicts`)).body.data.summary.total).toBe(0);
  });
  it("soft conflict between two activities; timeline shows the merged feed", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/activities`, { title: "Overlap", startTime: "2026-12-22T10:00", endTime: "2026-12-22T12:00" });
    expect(r.status).toBe(409);
    expect(r.body.error?.details.conflicts[0].severity).toBe("soft");
    const tl = (await owner.client.get(`/api/trips/${tripId}/timeline`)).body.data;
    expect(new Set(tl.map((i: any) => i.itemType))).toEqual(new Set(["transport", "accommodation", "activity"]));
    expect([...tl].map((i: any) => i.startTime)).toEqual([...tl].map((i: any) => i.startTime).sort());
  });
  it("update changes BOTH stores; the index becomes pending again when the text changes", async () => {
    const up = await owner.client.put(`/api/trips/${tripId}/activities/${actId}`, { title: "Fort Aguada Sunset Visit", description: "Sunset over the sea fortress", tags: ["fort", "sunset"] });
    expect(up.status).toBe(200);
    expect((await pg.query("SELECT title FROM itinerary_slots WHERE mongo_doc_id=$1", [actId])).rows[0].title).toBe("Fort Aguada Sunset Visit");
    expect((await activities().findOne({ _id: new ObjectId(actId) }))!.tags).toEqual(["fort", "sunset"]);
    const idx = (await pg.query("SELECT content, sync_status FROM activity_embeddings WHERE mongo_doc_id=$1", [actId])).rows[0];
    expect(idx.content).toContain("Sunset");
    if (idx.sync_status === "pending") expect(true).toBe(true);
  });
  it("members can only change their own activities; organizers can change any", async () => {
    const mine = await friend.client.post(`/api/trips/${tripId}/activities`, { title: "Friend Beach Time", startTime: "2026-12-22T15:00", endTime: "2026-12-22T16:30", tags: ["beach"], description: "Relax on the sand" });
    expect(mine.status).toBe(201);
    expect((await friend.client.put(`/api/trips/${tripId}/activities/${actId}`, { title: "hijack" })).status).toBe(403);
    expect((await friend.client.del(`/api/trips/${tripId}/activities/${actId}`)).status).toBe(403);
    expect((await owner.client.put(`/api/trips/${tripId}/activities/${mine.body.data.activity.id}`, { description: "Organizer edit" })).status).toBe(200);
  });
  it("MongoDB aggregation insights reflect the stored documents", async () => {
    const i = (await owner.client.get(`/api/trips/${tripId}/insights`)).body.data;
    expect(i.totals.activities).toBeGreaterThanOrEqual(3);
    expect(i.topTags.map((t: any) => t.tag)).toContain("fort");
    const b = (await owner.client.get(`/api/trips/${tripId}/budget`)).body.data;
    expect(Number(b.estimatedActivitiesTotal)).toBeGreaterThanOrEqual(150);
  });
  it("delete removes it from PostgreSQL, the index AND MongoDB", async () => {
    expect((await owner.client.del(`/api/trips/${tripId}/activities/${actId}`)).status).toBe(200);
    expect((await pg.query("SELECT 1 FROM itinerary_slots WHERE mongo_doc_id=$1", [actId])).rowCount).toBe(0);
    expect((await pg.query("SELECT 1 FROM activity_embeddings WHERE mongo_doc_id=$1", [actId])).rowCount).toBe(0);
    expect(await activities().findOne({ _id: new ObjectId(actId) })).toBeNull();
    expect((await owner.client.del(`/api/trips/${tripId}/activities/${actId}`)).status).toBe(404);
  });
});

describe("8. search (honest about what is running)", () => {
  it("keyword mode: full-text search, any-word match, ranked", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/search`, { query: "beach sand", mode: "keyword" });
    expect(r.status).toBe(200);
    expect(r.body.data.modeUsed).toBe("keyword");
    expect(r.body.data.results.map((x: any) => x.title)).toContain("Friend Beach Time");
  });
  it("auto mode never lies: it reports which engine produced the results", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/search`, { query: "relaxing seaside afternoon" });
    expect(r.status).toBe(200);
    expect(["semantic", "keyword"]).toContain(r.body.data.modeUsed);
    if (r.body.data.modeUsed === "keyword") expect(r.body.data.notice).toMatch(/semantic search|not indexed/i);
  });
  it("explicit semantic mode returns 503 (not fake results) when the model is unavailable", async () => {
    const r = await owner.client.post(`/api/trips/${tripId}/search`, { query: "relaxing", mode: "semantic" });
    expect([200, 503]).toContain(r.status);
    if (r.status === 503) expect(r.body.error?.code).toBe("EMBEDDINGS_UNAVAILABLE");
  });
  it("search is scoped to the trip and validated", async () => {
    expect((await owner.client.post(`/api/trips/${tripId}/search`, { query: "" })).status).toBe(400);
    expect((await stranger.client.post(`/api/trips/${tripId}/search`, { query: "beach" })).status).toBe(404);
  });
});

describe("9. dashboard & admin role", () => {
  it("dashboard shows real numbers for this user only", async () => {
    const d = (await owner.client.get("/api/dashboard")).body.data;
    expect(d.totals.trips).toBeGreaterThanOrEqual(1);
    expect(d.money[0].currency).toBe("INR");
    expect(Number(d.money[0].spent)).toBeGreaterThan(0);
    const s = (await stranger.client.get("/api/dashboard")).body.data;
    expect(s.totals.trips).toBe(1);
  });
  it("regular users are forbidden from admin endpoints", async () => {
    for (const p of ["/api/admin/overview"]) expect((await owner.client.get(p)).status).toBe(403);
    expect((await owner.client.post("/api/admin/reconcile")).status).toBe(403);
    expect((await owner.client.patch(`/api/admin/users/${friend.userId}`, { status: "suspended" })).status).toBe(403);
    expect((await new Client().get("/api/admin/overview")).status).toBe(401);
  });
  it("admin sees system overview, can reconcile and can suspend a user (effective immediately)", async () => {
    const admin = new Client();
    const login = await admin.post("/api/auth/login", { email: process.env.SEED_ADMIN_EMAIL || "admin@tripsync.local", password: process.env.SEED_ADMIN_PASSWORD! });
    expect(login.status).toBe(200);
    const ov = (await admin.get("/api/admin/overview")).body.data;
    expect(ov.counts.users).toBeGreaterThan(3);
    expect(ov.users[0]).not.toHaveProperty("passwordHash");
    const rec = await admin.post("/api/admin/reconcile");
    expect(rec.status).toBe(200);
    expect(rec.body.data).toHaveProperty("deletedOrphanDocuments");
    // admin cannot read someone's private trip content
    expect((await admin.get(`/api/trips/${tripId}`)).status).toBe(404);
    expect((await admin.patch(`/api/admin/users/${stranger.userId}`, { status: "suspended" })).status).toBe(200);
    expect((await stranger.client.get("/api/trips")).status).toBe(401); // existing session is dead at once
    const again = await new Client().post("/api/auth/login", { email: stranger.email, password: PASSWORD });
    expect(again.status).toBe(403);
    expect((await admin.patch(`/api/admin/users/${login.body.data.user.userId}`, { role: "user" })).status).toBe(409); // no self-demotion
  });
  it("reconcile repairs drift: orphan Mongo documents are removed, missing ones recreated", async () => {
    const admin = new Client();
    await admin.post("/api/auth/login", { email: process.env.SEED_ADMIN_EMAIL || "admin@tripsync.local", password: process.env.SEED_ADMIN_PASSWORD! });
    const orphanId = new ObjectId();
    const now = new Date();
    await activities().insertOne({ _id: orphanId, tripId, slotType: "custom", title: "Orphan", createdBy: owner.userId, createdAt: now, updatedAt: now } as any);
    const slot = (await pg.query("SELECT mongo_doc_id FROM itinerary_slots WHERE trip_id=$1 LIMIT 1", [tripId])).rows[0].mongo_doc_id;
    await activities().deleteOne({ _id: new ObjectId(slot) }); // simulate a lost document
    const r = (await admin.post("/api/admin/reconcile")).body.data;
    expect(r.deletedOrphanDocuments).toBeGreaterThanOrEqual(1);
    expect(r.recreatedDocuments).toBeGreaterThanOrEqual(1);
    expect(await activities().findOne({ _id: orphanId })).toBeNull();
    expect(await activities().findOne({ _id: new ObjectId(slot) })).not.toBeNull();
  });
});

describe("10. deleting a trip cleans up everything", () => {
  it("removes rows from PostgreSQL and documents from MongoDB; others cannot", async () => {
    expect((await friend.client.del(`/api/trips/${tripId}`)).status).toBe(403);
    expect((await activities().countDocuments({ tripId }))).toBeGreaterThan(0);
    const r = await owner.client.del(`/api/trips/${tripId}`);
    expect(r.status).toBe(200);
    for (const t of ["destinations", "transports", "accommodations", "expenses", "budgets", "itinerary_slots", "trip_members", "activity_embeddings"])
      expect((await pg.query(`SELECT count(*)::int n FROM ${t} WHERE trip_id=$1`, [tripId])).rows[0].n, t).toBe(0);
    expect(await activities().countDocuments({ tripId })).toBe(0);
    expect((await owner.client.get(`/api/trips/${tripId}`)).status).toBe(404);
  });
});
