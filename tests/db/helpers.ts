import { Pool } from "pg";
import { testDbUrl } from "./globalSetup";

export const pool = new Pool({ connectionString: testDbUrl(), max: 4 });

const BCRYPT = "$2b$12$" + "a".repeat(53); // shape-valid bcrypt hash (60 chars)
let n = 0;
const uid = () => `${Date.now().toString(36)}${n++}`;

export async function user(role: "user" | "admin" = "user") {
  const { rows } = await pool.query(
    "INSERT INTO users(name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING user_id",
    ["User " + uid(), `u${uid()}@t.local`, BCRYPT, role]
  );
  return rows[0].user_id as number;
}

export async function trip(createdBy: number, start = "2026-12-20", end = "2026-12-24") {
  const { rows } = await pool.query(
    "INSERT INTO trips(trip_name,start_date,end_date,created_by) VALUES ('T',$1,$2,$3) RETURNING trip_id",
    [start, end, createdBy]
  );
  const id = rows[0].trip_id as number;
  await pool.query("INSERT INTO trip_members(trip_id,user_id,member_role) VALUES ($1,$2,'organizer')", [id, createdBy]);
  return id;
}

export async function member(tripId: number, userId: number, role = "member") {
  await pool.query("INSERT INTO trip_members(trip_id,user_id,member_role) VALUES ($1,$2,$3)", [tripId, userId, role]);
}

export async function destination(tripId: number, name = "D", a = "2026-12-20", d = "2026-12-24") {
  const { rows } = await pool.query(
    "INSERT INTO destinations(trip_id,name,location,arrival_date,departure_date) VALUES ($1,$2,$2,$3,$4) RETURNING destination_id",
    [tripId, name, a, d]
  );
  return rows[0].destination_id as number;
}

/** Runs a statement and returns the error message (or null). */
export async function failure(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await pool.query(sql, params);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function hex24(): string {
  return Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}

/** pgvector literal with a single dominant axis, e.g. axis(0) = [1,0,0,...]. */
export function axis(i: number, tilt = 0): string {
  const v = Array(384).fill(0);
  v[i] = 1;
  if (tilt) v[(i + 1) % 384] = tilt;
  return `[${v.join(",")}]`;
}
