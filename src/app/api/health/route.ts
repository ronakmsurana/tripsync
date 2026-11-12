// GET /api/health — liveness + dependency checks (no secrets, no data)
import { NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { getMongoDb } from "@/lib/db/mongodb";
import { embeddingStatus } from "@/lib/services/embeddingService";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  try {
    const r = await prisma.$queryRaw<{ v: string | null }[]>`SELECT (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS v`;
    checks.postgres = { ok: true };
    checks.pgvector = r[0]?.v ? { ok: true, detail: `v${r[0].v}` } : { ok: false, detail: "extension not installed" };
  } catch {
    checks.postgres = { ok: false, detail: "unreachable" };
  }
  try {
    await (await getMongoDb()).command({ ping: 1 });
    checks.mongodb = { ok: true };
  } catch {
    checks.mongodb = { ok: false, detail: "unreachable" };
  }
  const emb = embeddingStatus();
  checks.embeddings = { ok: emb.enabled && !emb.lastError, detail: emb.enabled ? (emb.lastError ? "model failed to load" : `model ${emb.model} (loaded on first use)`) : "disabled" };
  const healthy = checks.postgres.ok && checks.mongodb.ok;
  return NextResponse.json({ success: healthy, data: checks }, { status: healthy ? 200 : 503 });
}
