// GET/POST /api/trips/[tripId]/activities
import { ANY_ROLE, CAN_EDIT, route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { createActivitySchema } from "@/lib/utils/validation";
import { createActivity, listActivities } from "@/lib/services/activityService";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => ok(await listActivities(tripId)));

export const POST = route({ trip: CAN_EDIT }, async (ctx) => {
  const input = await ctx.body(createActivitySchema);
  const result = await createActivity(ctx.tripId, ctx.user.userId, input);
  return created(result, result.conflicts.length ? "Activity saved with schedule conflicts" : "Activity added");
});
