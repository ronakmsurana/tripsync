// GET /api/trips/[tripId]/conflicts — every schedule conflict, with suggested free slots
import { ANY_ROLE, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { getTripConflicts } from "@/lib/services/conflictEngine";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => {
  const conflicts = await getTripConflicts(tripId);
  return ok({
    conflicts,
    summary: { total: conflicts.length, hard: conflicts.filter((c) => c.severity === "hard").length, soft: conflicts.filter((c) => c.severity === "soft").length },
  });
});
