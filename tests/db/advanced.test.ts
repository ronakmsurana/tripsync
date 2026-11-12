import { afterAll, describe, expect, it } from "vitest";
import { axis, destination, failure, hex24, member, pool, trip, user } from "./helpers";

afterAll(() => pool.end());

/** Inserts an expense + equal splits inside ONE transaction (what the API does). */
async function expense(t: number, payer: number, amount: string, splits: [number, string][], category = "food") {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query("INSERT INTO expenses(trip_id,paid_by,category,amount,expense_date) VALUES ($1,$2,$3,$4,'2026-12-21') RETURNING expense_id", [t, payer, category, amount]);
    for (const [u, share] of splits) await c.query("INSERT INTO expense_splits(expense_id,user_id,share_amount) VALUES ($1,$2,$3)", [rows[0].expense_id, u, share]);
    await c.query("COMMIT");
    return rows[0].expense_id as number;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

describe("transactions + deferred constraint trigger (splits must equal the amount)", () => {
  it("commits when the splits add up exactly", async () => {
    const a = await user(); const b = await user(); const t = await trip(a); await member(t, b);
    await expense(t, a, "100.01", [[a, "50.01"], [b, "50.00"]]);
    const { rows } = await pool.query("SELECT sum(share_amount) s FROM expense_splits es JOIN expenses e USING(expense_id) WHERE e.trip_id=$1", [t]);
    expect(rows[0].s).toBe("100.01");
  });
  it("rolls EVERYTHING back (expense row too) when the splits do not add up", async () => {
    const a = await user(); const b = await user(); const t = await trip(a); await member(t, b);
    await expect(expense(t, a, "100.00", [[a, "50.00"], [b, "49.99"]])).rejects.toThrow(/TS_SPLIT_SUM/);
    const { rows } = await pool.query("SELECT count(*)::int n FROM expenses WHERE trip_id=$1", [t]);
    expect(rows[0].n).toBe(0);
  });
  it("rejects a payer or split user who is not an active member", async () => {
    const a = await user(); const outsider = await user(); const t = await trip(a);
    expect(await failure("INSERT INTO expenses(trip_id,paid_by,category,amount,expense_date) VALUES ($1,$2,'food',10,'2026-12-21')", [t, outsider])).toMatch(/TS_NOT_A_MEMBER/);
    await expect(expense(t, a, "10.00", [[outsider, "10.00"]])).rejects.toThrow(/TS_NOT_A_MEMBER/);
  });
  it("changing an expense amount without fixing its splits fails at commit", async () => {
    const a = await user(); const t = await trip(a);
    const id = await expense(t, a, "20.00", [[a, "20.00"]]);
    expect(await failure("UPDATE expenses SET amount=25 WHERE expense_id=$1", [id])).toMatch(/TS_SPLIT_SUM/);
  });
  it("the payer's own share is automatically marked settled", async () => {
    const a = await user(); const b = await user(); const t = await trip(a); await member(t, b);
    const id = await expense(t, a, "10.00", [[a, "5.00"], [b, "5.00"]]);
    const { rows } = await pool.query("SELECT user_id, is_settled FROM expense_splits WHERE expense_id=$1 ORDER BY user_id", [id]);
    expect(rows.find((r) => r.user_id === a).is_settled).toBe(true);
    expect(rows.find((r) => r.user_id === b).is_settled).toBe(false);
  });
});

describe("stored function fn_settle_member_dues + view vw_member_balances", () => {
  it("settles all dues atomically, records payments, and balances net to zero", async () => {
    const a = await user(); const b = await user(); const c = await user();
    const t = await trip(a); await member(t, b); await member(t, c);
    await expense(t, a, "300.00", [[a, "100.00"], [b, "100.00"], [c, "100.00"]]);
    await expense(t, b, "90.00", [[a, "30.00"], [b, "30.00"], [c, "30.00"]]);

    const before = await pool.query("SELECT user_id, net_balance FROM vw_member_balances WHERE trip_id=$1", [t]);
    const net = (rows: { user_id: number; net_balance: string }[], u: number) => rows.find((r) => r.user_id === u)!.net_balance;
    expect(net(before.rows, a)).toBe("170.00");   // paid 300, owes 130
    expect(net(before.rows, b)).toBe("-40.00");   // paid 90, owes 130
    expect(net(before.rows, c)).toBe("-130.00");
    expect(before.rows.reduce((s, r) => s + Number(r.net_balance), 0)).toBe(0);

    const r1 = await pool.query("SELECT * FROM fn_settle_member_dues($1,$2,'upi')", [t, c]);
    expect(r1.rows[0]).toMatchObject({ settled_count: 2, total_settled: "130.00" });
    const after = await pool.query("SELECT user_id, net_balance FROM vw_member_balances WHERE trip_id=$1", [t]);
    expect(net(after.rows, c)).toBe("0.00");
    expect(after.rows.reduce((s, r) => s + Number(r.net_balance), 0)).toBe(0);

    expect((await pool.query("SELECT dues_outstanding FROM vw_member_balances WHERE trip_id=$1 AND user_id=$2", [t, c])).rows[0].dues_outstanding).toBe("0");
    const r2 = await pool.query("SELECT * FROM fn_settle_member_dues($1,$2,'upi')", [t, c]);
    expect(r2.rows[0]).toMatchObject({ settled_count: 0, total_settled: "0" }); // idempotent
    const pay = await pool.query("SELECT count(*)::int n FROM payments p JOIN expenses e USING(expense_id) WHERE e.trip_id=$1", [t]);
    expect(pay.rows[0].n).toBe(2);
  });
});

describe("views", () => {
  it("vw_budget_vs_actual shows categories that have spend but no budget (planned 0)", async () => {
    const a = await user(); const t = await trip(a);
    await pool.query("INSERT INTO budgets(trip_id,category,planned_amount) VALUES ($1,'food',500)", [t]);
    await expense(t, a, "120.50", [[a, "120.50"]], "food");
    await expense(t, a, "80.00", [[a, "80.00"]], "shopping"); // never budgeted
    const { rows } = await pool.query("SELECT category, planned, spent, remaining, utilization_pct FROM vw_budget_vs_actual WHERE trip_id=$1 ORDER BY category", [t]);
    expect(rows).toEqual([
      { category: "food", planned: "500.00", spent: "120.50", remaining: "379.50", utilization_pct: "24.1" },
      { category: "shopping", planned: "0", spent: "80.00", remaining: "-80.00", utilization_pct: null },
    ]);
  });
  it("vw_trip_timeline merges transport, stays and activities in one chronological feed", async () => {
    const a = await user(); const t = await trip(a); const d1 = await destination(t, "A"); const d2 = await destination(t, "B");
    await pool.query("INSERT INTO transports(trip_id,transport_type,provider,departure_destination_id,arrival_destination_id,departure_time,arrival_time) VALUES ($1,'bus','P',$2,$3,'2026-12-21 08:00','2026-12-21 12:00')", [t, d1, d2]);
    await pool.query("INSERT INTO accommodations(trip_id,destination_id,name,check_in,check_out) VALUES ($1,$2,'H','2026-12-21 14:00','2026-12-22 10:00')", [t, d2]);
    await pool.query("INSERT INTO itinerary_slots(trip_id,mongo_doc_id,slot_type,title,start_time,end_time,created_by) VALUES ($1,$2,'leisure','Walk','2026-12-21 16:00','2026-12-21 17:00',$3)", [t, hex24(), a]);
    const { rows } = await pool.query("SELECT item_type FROM vw_trip_timeline WHERE trip_id=$1 ORDER BY start_time", [t]);
    expect(rows.map((r) => r.item_type)).toEqual(["transport", "accommodation", "activity"]);
  });
  it("fn_trip_stats counts rows and computes the inclusive duration", async () => {
    const a = await user(); const t = await trip(a, "2026-12-20", "2026-12-24"); await destination(t);
    await pool.query("INSERT INTO budgets(trip_id,category,planned_amount) VALUES ($1,'food',250)", [t]);
    const { rows } = await pool.query("SELECT * FROM fn_trip_stats($1)", [t]);
    expect(rows[0]).toMatchObject({ total_destinations: 1, total_members: 1, total_planned: "250.00", total_spent: "0", trip_duration_days: 5 });
  });
});

describe("search index: full-text (GIN) + vector similarity (pgvector, cosine)", () => {
  async function indexRow(t: number, title: string, content: string, vec?: string) {
    const id = hex24();
    if (vec) await pool.query("INSERT INTO activity_embeddings(mongo_doc_id,trip_id,title,content,embedding,embedding_model,sync_status) VALUES ($1,$2,$3,$4,$5::vector,'test-vectors','synced')", [id, t, title, content, vec]);
    else await pool.query("INSERT INTO activity_embeddings(mongo_doc_id,trip_id,title,content) VALUES ($1,$2,$3,$4)", [id, t, title, content]);
    return id;
  }

  it("ranks by cosine similarity (1 - distance) with the <=> operator and stays inside the trip", async () => {
    const a = await user(); const t = await trip(a); const other = await trip(a);
    const near = await indexRow(t, "near", "x", axis(0, 0.1));
    const mid = await indexRow(t, "mid", "x", axis(0, 1));
    const far = await indexRow(t, "far", "x", axis(5));
    await indexRow(other, "other-trip", "x", axis(0)); // identical vector but different trip: must not appear
    const { rows } = await pool.query(
      "SELECT mongo_doc_id, 1 - (embedding <=> $1::vector) AS score FROM activity_embeddings WHERE trip_id=$2 AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 5",
      [axis(0), t]
    );
    expect(rows.map((r) => r.mongo_doc_id)).toEqual([near, mid, far]);
    expect(Number(rows[0].score)).toBeGreaterThan(0.99);
    expect(Number(rows[1].score)).toBeCloseTo(0.7071, 3);
    expect(Number(rows[2].score)).toBeCloseTo(0, 6);
  });

  it("rejects a vector of the wrong dimension and a 'synced' row without a vector", async () => {
    const a = await user(); const t = await trip(a);
    expect(await failure("INSERT INTO activity_embeddings(mongo_doc_id,trip_id,title,content,embedding) VALUES ($1,$2,'x','x','[1,2,3]')", [hex24(), t])).toMatch(/dimension/);
    expect(await failure("INSERT INTO activity_embeddings(mongo_doc_id,trip_id,title,content,sync_status) VALUES ($1,$2,'x','x','synced')", [hex24(), t])).toMatch(/ck_activity_embeddings_consistent/);
  });

  it("full-text search matches stems / prefixes and ranks title above body", async () => {
    const a = await user(); const t = await trip(a);
    const title = await indexRow(t, "Temple walk", "an easy stroll");
    const body = await indexRow(t, "Lunch", "eat near the temple after");
    await indexRow(t, "Boat", "river rides");
    const { rows } = await pool.query(
      "SELECT mongo_doc_id, ts_rank_cd(search_vector, q) r FROM activity_embeddings, to_tsquery('english','temples:* | river:*') q WHERE trip_id=$1 AND search_vector @@ q ORDER BY r DESC",
      [t]
    );
    expect(rows).toHaveLength(3);
    expect(rows.findIndex((r) => r.mongo_doc_id === title)).toBeLessThan(rows.findIndex((r) => r.mongo_doc_id === body));
  });

  it("uses a GIN index for FTS and an HNSW index for vectors (indexes exist)", async () => {
    const { rows } = await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='activity_embeddings'");
    const defs = rows.map((r) => r.indexdef).join("\n");
    expect(defs).toMatch(/USING gin \(search_vector\)/);
    expect(defs).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
  });

  it("index rows disappear with their trip (no stale search results)", async () => {
    const a = await user(); const t = await trip(a);
    await indexRow(t, "x", "x");
    await pool.query("DELETE FROM trips WHERE trip_id=$1", [t]);
    const { rows } = await pool.query("SELECT count(*)::int n FROM activity_embeddings WHERE trip_id=$1", [t]);
    expect(rows[0].n).toBe(0);
  });
});

describe("DDL demonstration: CREATE / ALTER / DROP", () => {
  it("creates, alters and drops a scratch table", async () => {
    await pool.query("DROP TABLE IF EXISTS ddl_demo");
    await pool.query("CREATE TABLE ddl_demo (id SERIAL PRIMARY KEY, label VARCHAR(20) NOT NULL)");
    await pool.query("ALTER TABLE ddl_demo ADD COLUMN rating INTEGER");
    await pool.query("ALTER TABLE ddl_demo ADD CONSTRAINT ck_demo_rating CHECK (rating BETWEEN 1 AND 5)");
    await pool.query("CREATE INDEX idx_ddl_demo_label ON ddl_demo(label)");
    expect(await failure("INSERT INTO ddl_demo(label,rating) VALUES ('x',9)")).toMatch(/ck_demo_rating/);
    await pool.query("ALTER TABLE ddl_demo ALTER COLUMN label TYPE VARCHAR(50)");
    await pool.query("ALTER TABLE ddl_demo DROP COLUMN rating");
    await pool.query("DROP INDEX idx_ddl_demo_label");
    await pool.query("DROP TABLE ddl_demo");
    const { rows } = await pool.query("SELECT to_regclass('ddl_demo') t");
    expect(rows[0].t).toBeNull();
  });
});
