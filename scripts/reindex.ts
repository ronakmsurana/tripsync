// npm run db:reindex — repair PostgreSQL <-> MongoDB <-> vector-index drift and fill missing embeddings.
import "dotenv/config";
import prisma from "../src/lib/db/postgres";
import { closeMongo } from "../src/lib/db/mongodb";
import { reconcile } from "../src/lib/services/syncService";

reconcile()
  .then((r) => console.log("✓ Reconciled:", JSON.stringify(r)))
  .catch((e) => { console.error("✗ Reconcile failed:", e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await closeMongo(); });
