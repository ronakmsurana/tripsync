// GET  /api/trips?q=&status=&sort=  — the signed-in user's trips
// POST /api/trips                   — create a trip (creator becomes organizer)
import { route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { createTripSchema, tripListQuerySchema } from "@/lib/utils/validation";
import { createTrip, listTrips } from "@/lib/services/tripService";

export const GET = route({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const query = tripListQuerySchema.parse({
    q: sp.get("q") || undefined, status: sp.get("status") || undefined, sort: sp.get("sort") || undefined,
  });
  return ok(await listTrips(user.userId, query));
});

export const POST = route({}, async (ctx) => {
  const input = await ctx.body(createTripSchema);
  const trip = await createTrip(ctx.user.userId, input);
  return created({ tripId: trip.tripId }, "Trip created");
});
