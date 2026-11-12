// PUT/DELETE /api/trips/[tripId]/destinations/[destinationId]
import prisma from "@/lib/db/postgres";
import { ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { conflict, notFound } from "@/lib/api/errors";
import { destinationSchema } from "@/lib/utils/validation";
import { parseDateOnly } from "@/lib/utils/time";
import { destinationDTO } from "@/lib/services/mappers";

export const PUT = route({ trip: ORGANIZER }, async (ctx) => {
  const destinationId = ctx.int("destinationId");
  const d = await ctx.body(destinationSchema);
  const existing = await prisma.destination.findFirst({ where: { destinationId, tripId: ctx.tripId } });
  if (!existing) throw notFound("Destination not found");
  const row = await prisma.destination.update({
    where: { destinationId },
    data: { name: d.name, location: d.location, arrivalDate: parseDateOnly(d.arrivalDate), departureDate: parseDateOnly(d.departureDate), notes: d.notes ?? null },
  });
  return ok(destinationDTO(row), { message: "Destination updated" });
});

export const DELETE = route({ trip: ORGANIZER }, async (ctx) => {
  const destinationId = ctx.int("destinationId");
  const existing = await prisma.destination.findFirst({ where: { destinationId, tripId: ctx.tripId } });
  if (!existing) throw notFound("Destination not found");
  const [transports, stays] = await Promise.all([
    prisma.transport.count({ where: { tripId: ctx.tripId, OR: [{ departureDestinationId: destinationId }, { arrivalDestinationId: destinationId }] } }),
    prisma.accommodation.count({ where: { tripId: ctx.tripId, destinationId } }),
  ]);
  if (transports + stays > 0) {
    throw conflict(`This destination is used by ${transports} transport booking(s) and ${stays} stay(s). Remove or change those first.`, undefined, "IN_USE");
  }
  await prisma.$transaction([
    prisma.itinerarySlot.updateMany({ where: { destinationId }, data: { destinationId: null } }), // activities stay, just unlinked
    prisma.destination.delete({ where: { destinationId } }),
  ]);
  return ok({ deleted: true }, { message: "Destination removed" });
});
