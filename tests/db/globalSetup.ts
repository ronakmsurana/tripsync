// Creates a fresh `tripsync_test` database and applies EVERY migration file in order,
// so the suite also proves that migrations work on an empty database.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

export const TEST_DB = "tripsync_test";

export function adminUrl(): string {
  return process.env.TEST_DATABASE_ADMIN_URL || (process.env.DATABASE_URL || "").replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
}
export function testDbUrl(): string {
  return adminUrl().replace(/\/postgres(\?.*)?$/, `/${TEST_DB}$1`);
}

export default async function setup() {
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const db = new Client({ connectionString: testDbUrl() });
  await db.connect();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((f) => /^\d+_/.test(f)).sort()) {
    await db.query(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  await db.end();
  process.env.TEST_DATABASE_URL = testDbUrl();
}
