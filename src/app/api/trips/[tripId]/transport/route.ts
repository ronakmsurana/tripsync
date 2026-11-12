// GET/POST /api/trips/[tripId]/transport
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { transportSchema } from "@/lib/utils/validation";
import { parseLocalDateTime } from "@/lib/utils/time";
import { assertDestinationsInTrip } from "@/lib/services/bookingGuards";
import { transportDTO, transportInclude } from "@/lib/services/mappers";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => {
  const rows = await prisma.transport.findMany({ where: { tripId }, include: transportInclude, orderBy: { departureTime: "asc" } });
  return ok(rows.map(transportDTO));
});

export const POST = route({ trip: ORGANIZER }, async (ctx) => {
  const d = await ctx.body(transportSchema);
  await assertDestinationsInTrip(ctx.tripId, [d.departureDestinationId, d.arrivalDestinationId]);
  const row = await prisma.transport.create({
    data: {
      tripId: ctx.tripId, transportType: d.transportType, provider: d.provider,
      departureDestinationId: d.departureDestinationId, arrivalDestinationId: d.arrivalDestinationId,
      departureTime: parseLocalDateTime(d.departureTime), arrivalTime: parseLocalDateTime(d.arrivalTime),
      bookingReference: d.bookingReference, cost: d.cost, status: d.status,
    },
    include: transportInclude,
  });
  return created(transportDTO(row), "Transport added");
});
