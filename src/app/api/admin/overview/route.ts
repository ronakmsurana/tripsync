// GET /api/admin/overview — system-wide counts (admin role only)
import { route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { systemOverview } from "@/lib/services/syncService";
import { embeddingStatus } from "@/lib/services/embeddingService";

export const GET = route({ admin: true }, async () => ok({ ...(await systemOverview()), embedding: embeddingStatus() }));
