// GET/PUT/DELETE /api/trips/[tripId]
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { updateTripSchema } from "@/lib/utils/validation";
import { deleteTrip, getTripDetail, updateTrip } from "@/lib/services/tripService";

export const GET = route({ trip: ANY_ROLE }, async (ctx) => ok(await getTripDetail(ctx.tripId, ctx.role!)));

export const PUT = route({ trip: ORGANIZER }, async (ctx) => {
  const input = await ctx.body(updateTripSchema);
  await updateTrip(ctx.tripId, input);
  return ok(await getTripDetail(ctx.tripId, ctx.role!), { message: "Trip updated" });
});

export const DELETE = route({ trip: ORGANIZER }, async (ctx) => {
  await deleteTrip(ctx.tripId);
  return ok({ deleted: true }, { message: "Trip deleted" });
});
