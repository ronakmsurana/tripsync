// GET /api/trips/[tripId]/insights — MongoDB $facet aggregation (by type, top tags, totals)
import { ANY_ROLE, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { getTripInsights } from "@/lib/services/insightsService";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => ok(await getTripInsights(tripId)));
