// GET /api/trips/[tripId]/timeline — unified chronological view (SQL view + MongoDB details)
import { ANY_ROLE, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { getTimeline } from "@/lib/services/timelineService";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => ok(await getTimeline(tripId)));
