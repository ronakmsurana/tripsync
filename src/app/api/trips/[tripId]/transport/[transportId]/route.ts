// PUT/DELETE /api/trips/[tripId]/transport/[transportId]
import prisma from "@/lib/db/postgres";
import { ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { notFound } from "@/lib/api/errors";
import { transportSchema } from "@/lib/utils/validation";
import { parseLocalDateTime } from "@/lib/utils/time";
import { transportDTO, transportInclude } from "@/lib/services/mappers";
import { assertDestinationsInTrip } from "@/lib/services/bookingGuards";

export const PUT = route({ trip: ORGANIZER }, async (ctx) => {
  const transportId = ctx.int("transportId");
  const d = await ctx.body(transportSchema);
  if (!(await prisma.transport.findFirst({ where: { transportId, tripId: ctx.tripId }, select: { transportId: true } }))) throw notFound("Transport not found");
  await assertDestinationsInTrip(ctx.tripId, [d.departureDestinationId, d.arrivalDestinationId]);
  const row = await prisma.transport.update({
    where: { transportId },
    data: {
      transportType: d.transportType, provider: d.provider, departureDestinationId: d.departureDestinationId,
      arrivalDestinationId: d.arrivalDestinationId, departureTime: parseLocalDateTime(d.departureTime),
      arrivalTime: parseLocalDateTime(d.arrivalTime), bookingReference: d.bookingReference ?? null, cost: d.cost, status: d.status,
    },
    include: transportInclude,
  });
  return ok(transportDTO(row), { message: "Transport updated" });
});

export const DELETE = route({ trip: ORGANIZER }, async (ctx) => {
  const transportId = ctx.int("transportId");
  const r = await prisma.transport.deleteMany({ where: { transportId, tripId: ctx.tripId } });
  if (r.count === 0) throw notFound("Transport not found");
  return ok({ deleted: true }, { message: "Transport removed" });
});
