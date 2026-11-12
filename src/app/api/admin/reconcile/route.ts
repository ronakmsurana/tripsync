// POST /api/admin/reconcile — repair PostgreSQL <-> MongoDB <-> vector index drift (admin only, idempotent)
import { route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { reconcile } from "@/lib/services/syncService";

export const POST = route({ admin: true }, async () => ok(await reconcile(), { message: "Reconciliation finished" }));
