// PUT/DELETE /api/trips/[tripId]/accommodation/[accommodationId]
import prisma from "@/lib/db/postgres";
import { ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { notFound } from "@/lib/api/errors";
import { accommodationSchema } from "@/lib/utils/validation";
import { parseLocalDateTime } from "@/lib/utils/time";
import { accommodationDTO, accommodationInclude } from "@/lib/services/mappers";
import { assertDestinationsInTrip } from "@/lib/services/bookingGuards";

export const PUT = route({ trip: ORGANIZER }, async (ctx) => {
  const accommodationId = ctx.int("accommodationId");
  const d = await ctx.body(accommodationSchema);
  if (!(await prisma.accommodation.findFirst({ where: { accommodationId, tripId: ctx.tripId }, select: { accommodationId: true } }))) throw notFound("Stay not found");
  await assertDestinationsInTrip(ctx.tripId, [d.destinationId]);
  const row = await prisma.accommodation.update({
    where: { accommodationId },
    data: {
      destinationId: d.destinationId, name: d.name, address: d.address ?? null, checkIn: parseLocalDateTime(d.checkIn),
      checkOut: parseLocalDateTime(d.checkOut), bookingReference: d.bookingReference ?? null, cost: d.cost, status: d.status,
    },
    include: accommodationInclude,
  });
  return ok(accommodationDTO(row), { message: "Stay updated" });
});

export const DELETE = route({ trip: ORGANIZER }, async (ctx) => {
  const accommodationId = ctx.int("accommodationId");
  const r = await prisma.accommodation.deleteMany({ where: { accommodationId, tripId: ctx.tripId } });
  if (r.count === 0) throw notFound("Stay not found");
  return ok({ deleted: true }, { message: "Stay removed" });
});
