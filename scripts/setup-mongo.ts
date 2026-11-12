// npm run db:mongo — creates the `activities` collection with its JSON-schema validator and indexes (idempotent).
import "dotenv/config";
import { ensureMongoSetup, closeMongo, getMongoDb } from "../src/lib/db/mongodb";

async function main() {
  await ensureMongoSetup();
  const db = await getMongoDb();
  const indexes = await db.collection("activities").indexes();
  console.log("✓ MongoDB ready. Indexes:", indexes.map((i) => i.name).join(", "));
}
main().catch((e) => { console.error("✗ MongoDB setup failed:", e.message); process.exitCode = 1; }).finally(closeMongo);
